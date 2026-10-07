# Neon Nexus entitlement service (VK votes IAP + OK payments: the `noads` good).
#
# The game is a fully static site; this service exists ONLY for the mini-app
# flavors of it (vk.com catalog + the same app published to OK). VK's payments
# bot calls the app's «URL для платёжных уведомлений ВКонтакте» with two
# callbacks:
#   get_item          — the goods catalog: title + price (votes) of `noads`
#   order_status_change (status=chargeable) — the actual purchase; the order
#                       is granted and confirmed by answering
#                       {"response": {"order_id": N}}
# Both are signature-verified with the app's «защищённый ключ» (same key the
# launch params are verified with). The client polls POST /api/vk/entitled
# with its raw launch params to confirm the grant landed.
#
# OK (Odnoklassniki): the same transferred app runs on OK with the SAME secret
# but a distinct app id (OK_APP_ID) and its own notification URL. The OK
# launcher translates the client's VKWebAppShowOrderBox into its own payment
# dialog; OK's payment bot (OdklApiBot) then
#   - speaks the SAME VK-protocol get_item/order_status_change against the VK
#     notification URL presenting app_id=OK_APP_ID — answered identically
#     except the price: OK users pay in ОКах (~1₽), VK users in votes (~7₽),
#     so the OK bot gets the ruble-parity scaled price;
#   - sends one callbacks.payment transaction (uid/transaction_id/amount/
#     product_code/sig; md5 sig skipping empty params) to the OK notification
#     URL (/api/ok/order), which must answer a literal `true` — errors carry
#     the «Invocation-error» HTTP header, 3 retries × 5s then refund. The
#     transaction uid is OK-native → the client registers the
#     ok_uid → vk_user_id mapping at boot (POST /api/ok/map, launch-params
#     verified; inside OK the launcher adds vk_ok_user_id and still signs the
#     VK-style params with the shared secret).
#
# Protocol quirks baked in below (learned on the quiz, see global AGENTS.md):
#   - tester notifications carry a `_test` suffix on every notification_type
#     — strip it and handle identically;
#   - the current notification_type is order_status_change (legacy aliases
#     order_change_state / order_state_change accepted);
#   - VK html-escapes item_title in state-change notifications and signs a
#     representation we cannot reproduce — on sig failure verify the order
#     server-to-server via orders.get (service token) and only then grant;
#   - order_status_change confirmation MUST be the nested
#     {"response": {"order_id": N}} — a bare int is the legacy answer and
#     leaves the payment dialog spinning before VK refunds;
#   - get_item answers with an `expiration` (cache ttl) so renames propagate.
#
# Env vars (see deploy/neonnexus-api.service):
#   VK_APP_ID                          the VK mini-app id (0/absent = accept any)
#   OK_APP_ID                          the OK app id (transferred app; accept both)
#   VK_APP_SECRET / VK_PROTECTED_KEY   «защищённый ключ» (shared VK/OK for
#                                      transferred apps)
#   VK_SERVICE_TOKEN / VK_SERVICE_KEY  «сервисный ключ» (orders.get fallback)
#   OK_APPLICATION_KEY                 OK application key — asserted on
#                                      callbacks.payment when set (defense in
#                                      depth; the md5 sig is the primary check)
#   OK_RUB_PER_VOTE                    ruble parity for OK prices (default 7)
#   NN_DATA_DIR                        where entitlements.json lives (default: .)
#   NN_NOADS_PRICE                     price in votes (default 15)
#   NN_PHOTO_URL                       photo_url served in get_item
#
# Run: uvicorn app:app --host 127.0.0.1 --port 8017  (nginx: /neon-nexus/api/)

import base64
import hashlib
import hmac
import html
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="neon-nexus-api", docs_url=None, redoc_url=None)

DATA_DIR = Path(os.environ.get("NN_DATA_DIR", "."))
ENT_FILE = DATA_DIR / "entitlements.json"

PRODUCT = "noads"  # the only good; item string is free-form ≤64 chars, no &<> in the title
NOADS_TITLE = "Отключить рекламу"  # no escapable chars — see the html-escape quirk above
NOADS_PRICE = int(os.environ.get("NN_NOADS_PRICE", "15") or 15)
NOADS_PHOTO = os.environ.get("NN_PHOTO_URL", "https://ru.nyrds.net/neon-nexus/img/noads-256.png")

# OK users pay in ОКах (~1₽ each), not VK votes (~7₽): the OK bot resolves
# the same good with a get_item probe presenting app_id=OK_APP_ID and is
# answered the ruble-parity scaled price, which its callbacks.payment
# transaction must then carry.
OK_RUB_PER_VOTE = float(os.environ.get("OK_RUB_PER_VOTE", "7") or 7)


def noads_ok_price():
    return max(1, round(NOADS_PRICE * OK_RUB_PER_VOTE))

VK_API_VERSION = "5.199"

# ---------------- VK global leaderboard (points table) ----------------
# The board ranks the BEST SINGLE GAME (Neon Nexus semantics — same as the
# local TOP RUNS table), but VK's secure.addAppEvent points counter is
# CUMULATIVE: it only adds. So the server keeps each player's best and
# submits only the delta above it — the table value then equals max game
# score. The server-side best is authoritative (survives reinstalls, extra
# devices and lost submissions: a game better than the stored best re-covers
# the whole gap on its own). Rendering is client-side only:
# VKWebAppShowLeaderBoardBox(user_result, global:1) never saves anything.
VK_API_URL = "https://api.vk.com/method/"
ACTIVITY_POINTS = 2
MAX_POINTS = 10_000_000


def _load_env_file(path: Path):
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except OSError:
        pass


_load_env_file(Path(__file__).resolve().parent / ".env")


def _vk_secret():
    return os.environ.get("VK_APP_SECRET") or os.environ.get("VK_PROTECTED_KEY", "")


def _service_token():
    return os.environ.get("VK_SERVICE_TOKEN") or os.environ.get("VK_SERVICE_KEY", "")


# ---------------- entitlement store ----------------
# {users: {vk_user_id: {"noads": <order_id>}}, orders: {order_id: {...}}}
# one JSON file, lock-guarded, written atomically — enough for a single-VPS.

_ent_lock = threading.Lock()


def load_ent():
    try:
        d = json.loads(ENT_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    d.setdefault("users", {})
    d.setdefault("orders", {})
    d.setdefault("ok_map", {})
    d.setdefault("bests", {})
    return d


def save_ent(data):
    ENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = ENT_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(ENT_FILE)


def grant_noads(user_id, order_id):
    """Grant noads to user_id; idempotent per order_id. Returns True when this
    call did the granting."""
    with _ent_lock:
        d = load_ent()
        oid = str(order_id)
        if oid in d["orders"]:
            return False
        d["orders"][oid] = {"user": int(user_id), "item": PRODUCT, "at": int(time.time())}
        d["users"].setdefault(str(int(user_id)), {})["noads"] = oid
        save_ent(d)
        return True


def revoke_order(order_id):
    """Revoke what order_id granted (declined / refunded)."""
    with _ent_lock:
        d = load_ent()
        oid = str(order_id)
        rec = d["orders"].pop(oid, None)
        if rec:
            user = d["users"].get(str(rec["user"]))
            if user and user.get("noads") == oid:
                user.pop("noads", None)
            save_ent(d)
    return bool(rec)


def user_has_noads(user_id):
    return PRODUCT in load_ent()["users"].get(str(int(user_id)), {})


def verify_launch_params(params: dict, secret: str) -> bool:
    """Official VK launch-params signature check (VKCOM/vk-apps-launch-params):
    HMAC-SHA256 over the urlencoded vk_* params sorted by key, base64url."""
    if not secret or not params.get("sign"):
        return False
    vk_keys = sorted(k for k in params if k.startswith("vk_"))
    if not vk_keys:
        return False
    message = urllib.parse.urlencode([(k, params[k]) for k in vk_keys]).encode()
    digest = hmac.new(secret.encode(), message, hashlib.sha256).digest()
    sign = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return hmac.compare_digest(sign, params["sign"])


def _lp_user(params_qs: str, secret: str):
    """Verify raw launch params (query string) and return the vk_user_id."""
    params = dict(urllib.parse.parse_qsl(params_qs or "", keep_blank_values=True))
    if not verify_launch_params(params, secret):
        return None
    try:
        return int(params["vk_user_id"])
    except (KeyError, ValueError):
        return None


# ---------------- health ----------------

@app.get("/api/health")
def health():
    return {"ok": True}


# ---------------- entitled lookup (client reconciliation) ----------------

class VkEntitledBody(BaseModel):
    lp: str  # raw launch params query string from the VK iframe URL


@app.post("/api/vk/entitled")
def vk_entitled(body: VkEntitledBody):
    secret = _vk_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="VK entitlements not configured")
    params = dict(urllib.parse.parse_qsl(body.lp or "", keep_blank_values=True))
    if not verify_launch_params(params, secret):
        raise HTTPException(status_code=403, detail="bad launch params signature")
    try:
        user_id = int(params["vk_user_id"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=403, detail="no vk_user_id in launch params")
    allowed = {os.environ.get("VK_APP_ID", "").strip(),
               os.environ.get("OK_APP_ID", "").strip()} - {"", "0"}
    # inside OK the launcher signs VK-style params with the shared secret but
    # presents the OK app id — both are the same person for a transferred app
    if allowed and params.get("vk_app_id") not in allowed:
        raise HTTPException(status_code=403, detail="launch params from another app")
    return {"user_id": user_id, "noads": user_has_noads(user_id)}


# ---------------- VK payments callbacks ----------------

def verify_callback_sig(params: dict, secret: str, drop_empty: bool = False) -> bool:
    """Classic VK payments-callback signature: md5 over all params except
    `sig`, sorted by key, concatenated as key=value, with the secret appended.
    OK's scheme is identical except empty-valued params are skipped
    (drop_empty=True, used by the OK order callback)."""
    if not secret or not params.get("sig"):
        return False
    items = sorted((k, str(v)) for k, v in params.items()
                   if k not in ("sig", "sign") and not (drop_empty and str(v) == ""))
    base = "".join(f"{k}={v}" for k, v in items) + secret
    return hmac.compare_digest(hashlib.md5(base.encode()).hexdigest(), str(params["sig"]))


def _orders_lookup(test_mode: bool):
    """orders.get with the service token: VK's own list of this app's orders.
    Fallback verifier for chargeable notifications whose sig we cannot
    reproduce (VK html-escapes item_title and signs a value form we don't
    receive) — the notification alone is then not trusted."""
    token = _service_token()
    if not token:
        return None
    payload = urllib.parse.urlencode({
        "test_mode": "1" if test_mode else "0",
        "count": "100",
        "access_token": token,
        "v": VK_API_VERSION,
    }).encode()
    req = urllib.request.Request("https://api.vk.com/method/orders.get",
                                 data=payload, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            out = json.loads(resp.read())
    except (OSError, ValueError):
        return None
    if out.get("error"):
        return None
    resp = out.get("response")
    if isinstance(resp, dict):
        return resp.get("orders") or []
    return resp if isinstance(resp, list) else None


def _err(code, msg):
    return JSONResponse({"error": {"error_code": code, "error_msg": msg, "critical": True}})


def _handle_vk_order(params: dict, raw_body: str = "") -> JSONResponse:
    secret = _vk_secret()
    if not secret:
        return _err(300, "payments not configured")
    # VK html-escapes values it adds to state-change notifications; accept
    # either the raw or the unescaped form when checking the signature
    unescaped = {k: html.unescape(str(v)) for k, v in params.items()}
    sig_ok = verify_callback_sig(params, secret) or verify_callback_sig(unescaped, secret)
    params = unescaped
    if not sig_ok:
        print(f"VK order: SIG UNVERIFIED (fallback to orders.get) sig={params.get('sig')!r} body={raw_body!r}", flush=True)

    allowed_app_ids = {os.environ.get(n, "").strip()
                       for n in ("VK_APP_ID", "OK_APP_ID")} - {"", "0"}
    if allowed_app_ids and params.get("app_id") and params.get("app_id") not in allowed_app_ids:
        # OK's payment bot presents the OK app id (OK_APP_ID) — transferred
        # apps keep one secret key but get a distinct app id per platform;
        # anything else gets logged and rejected
        print(f"VK order: APP MISMATCH got app_id={params.get('app_id')} expected={sorted(allowed_app_ids)}", flush=True)
        return _err(11, "Чужое приложение")

    # payment testers run the whole flow in test mode: every notification_type
    # carries a `_test` suffix and must be handled exactly like the real one
    ntype = params.get("notification_type", "")
    print(f"VK order: notification_type={ntype!r} item={params.get('item')!r} "
          f"user={params.get('user_id')!r} status={params.get('status')!r} order={params.get('order_id')!r} "
          f"app_id={params.get('app_id')!r}", flush=True)
    is_test = ntype.endswith("_test")
    if is_test:
        ntype = ntype[:-5]

    if ntype == "get_item":
        if not sig_ok:
            return _err(10, "Некорректная подпись")
        if params.get("item") != PRODUCT:
            print(f"VK order: ITEM NOT FOUND item={params.get('item')!r}", flush=True)
            return _err(20, "Товар не найден")
        # OK's bot (app_id = OK_APP_ID) asks for the same good on behalf of OK
        # users, who pay in ОКах rather than votes — serve the ruble-parity
        # price; its callbacks.payment must carry that same amount
        ok_bot = (os.environ.get("OK_APP_ID", "").strip()
                  and params.get("app_id") == os.environ.get("OK_APP_ID").strip())
        return JSONResponse({"response": {
            "item_id": params.get("item"),
            "title": NOADS_TITLE,
            "price": noads_ok_price() if ok_bot else NOADS_PRICE,
            "photo_url": NOADS_PHOTO,
            # VK caches item info in the purchase dialog; short ttl keeps
            # price/title changes (and their sig quirks) from lingering
            "expiration": 600,
        }})

    if ntype in ("order_change_state", "order_state_change", "order_status_change"):
        try:
            order_id = int(params.get("order_id", "0"))
            user_id = int(params.get("user_id", "0"))
        except ValueError:
            return _err(100, "Некорректный заказ")
        if not order_id or not user_id or params.get("item") != PRODUCT:
            return _err(100, "Некорректный заказ")
        status = params.get("status", "")
        if status == "chargeable":
            verified = sig_ok
            if not verified:
                orders = _orders_lookup(test_mode=is_test)
                if orders is not None:
                    # orders.get entries use `id` and `item` (not order_id/item_id)
                    verified = any(
                        str(o.get("id", o.get("order_id"))) == str(order_id)
                        and str(o.get("user_id")) == str(user_id)
                        and str(o.get("item", o.get("item_id", ""))) == PRODUCT
                        for o in orders if isinstance(o, dict)
                    )
                if verified:
                    print(f"VK order: grant via orders.get fallback, order {order_id}", flush=True)
            if not verified:
                # never confirm an unverifiable chargeable order — an error
                # makes VK cancel it and refund the user
                return _err(10, "Некорректная подпись")
            grant_noads(user_id, order_id)
        elif status in ("declined", "refunded"):
            revoke_order(order_id)

        # confirmation format: order_status_change (current) requires the
        # nested {"response": {"order_id": …}} — a bare int is the legacy
        # order_change_state answer and leaves the dialog «ожидаем
        # подтверждение» forever before VK refunds
        if ntype == "order_status_change":
            return JSONResponse({"response": {"order_id": order_id}})
        return JSONResponse({"response": order_id})

    return _err(11, "Неизвестный тип уведомления")


@app.get("/api/vk/order")
def vk_order_get(request: Request):
    return _handle_vk_order(dict(request.query_params))


@app.post("/api/vk/order")
async def vk_order_post(request: Request):
    # VK posts form-encoded bodies; parsed manually so the service needs no
    # python-multipart dependency
    params = dict(request.query_params)
    body = (await request.body()).decode("utf-8", "replace")
    params.update(dict(urllib.parse.parse_qsl(body, keep_blank_values=True)))
    return _handle_vk_order(params, raw_body=body)


# ---------------- OK (Odnoklassniki) purchases ----------------
# The OK-native uid in callbacks.payment differs from the vk_user_id the
# entitlement checks authenticate as, so the client registers a mapping at
# boot (POST /api/ok/map with its launch params: the OK launcher adds
# vk_ok_user_id and still signs the VK-style params with the shared secret);
# the transaction handler resolves the grant through it. Both ids map to the
# same person for transferred apps.

class OkMapBody(BaseModel):
    lp: str  # raw launch params query string from the OK/VK iframe URL


@app.post("/api/ok/map")
def ok_map(body: OkMapBody):
    secret = _vk_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="VK entitlements not configured")
    user = _lp_user(body.lp, secret)
    if user is None:
        raise HTTPException(status_code=403, detail="bad launch params signature")
    params = dict(urllib.parse.parse_qsl(body.lp or "", keep_blank_values=True))
    ok_uid = params.get("vk_ok_user_id", "")
    if not ok_uid.isdigit():
        raise HTTPException(status_code=400, detail="vk_ok_user_id missing")
    with _ent_lock:
        d = load_ent()
        changed = d["ok_map"].get(ok_uid) != user
        if changed:
            d["ok_map"][ok_uid] = user
            save_ent(d)
    return {"ok": True, "mapped": changed}


def _ok_error(code: int, msg: str) -> JSONResponse:
    return JSONResponse({"error_code": code, "error_msg": msg},
                        headers={"Invocation-error": str(code)})


def _handle_ok_order(params: dict) -> JSONResponse:
    secret = _vk_secret()
    if not secret:
        return _ok_error(300, "payments not configured")
    if not verify_callback_sig(params, secret, drop_empty=True):
        return _ok_error(10, "Некорректная подпись")
    expected_key = os.environ.get("OK_APPLICATION_KEY", "")
    if expected_key and params.get("application_key") != expected_key:
        return _ok_error(11, "Чужое приложение")
    if params.get("method", "callbacks.payment") != "callbacks.payment":
        return _ok_error(11, "Неизвестный тип уведомления")
    if params.get("product_code", "") != PRODUCT:
        return _ok_error(20, "Товар не найден")
    try:
        amount = int(float(params.get("amount", "0") or 0))
        uid = int(params.get("uid", "0") or 0)
        transaction = str(params.get("transaction_id", "") or "")
    except ValueError:
        return _ok_error(100, "Некорректная транзакция")
    if not uid or not transaction:
        return _ok_error(100, "Некорректная транзакция")
    if amount != noads_ok_price():
        return _ok_error(21, "Цена не совпадает")
    grant_user = load_ent()["ok_map"].get(str(uid)) or uid
    extra = params.get("extra_attributes") or ""
    if extra:
        try:
            grant_user = int(json.loads(extra).get("vk_user_id") or grant_user)
        except (ValueError, TypeError):
            pass
    grant_noads(grant_user, transaction)
    print(f"OK order: transaction {transaction} uid {uid} -> grant {PRODUCT} to user {grant_user}", flush=True)
    return JSONResponse(True)


@app.get("/api/ok/order")
def ok_order_get(request: Request):
    params = dict(request.query_params)
    if params.get("notification_type"):
        # a VK-protocol probe (get_item …) arriving on the OK notification
        # URL — answer it with the same VK-protocol handler
        return _handle_vk_order(params)
    return _handle_ok_order(params)


@app.post("/api/ok/order")
async def ok_order_post(request: Request):
    params = dict(request.query_params)
    body = (await request.body()).decode("utf-8", "replace")
    params.update(dict(urllib.parse.parse_qsl(body, keep_blank_values=True)))
    if params.get("notification_type"):
        return _handle_vk_order(params, raw_body=body)
    return _handle_ok_order(params)


# ---------------- leaderboard score push ----------------

class VkScoreBody(BaseModel):
    score: int          # the finished game's score (NOT a lifetime total)
    prev_best: int = 0  # accepted for protocol compat; the server's own best wins
    lp: str             # raw launch params query string from the VK/OK iframe URL


@app.post("/api/vk/score")
def vk_score(body: VkScoreBody):
    secret = _vk_secret()
    service_token = _service_token()
    if not secret or not service_token:
        raise HTTPException(status_code=503, detail="VK leaderboard not configured")
    user = _lp_user(body.lp, secret)
    if user is None:
        raise HTTPException(status_code=403, detail="bad launch params signature")
    params = dict(urllib.parse.parse_qsl(body.lp or "", keep_blank_values=True))
    allowed = {os.environ.get(n, "").strip()
               for n in ("VK_APP_ID", "OK_APP_ID")} - {"", "0"}
    if allowed and params.get("vk_app_id") not in allowed:
        raise HTTPException(status_code=403, detail="launch params from another app")

    # the board ranks the best single game; the cumulative counter gets only
    # the delta above the player's stored best (server-side authoritative —
    # re-submissions, other devices and lost posts cannot over-count)
    game_score = max(0, min(int(body.score), MAX_POINTS))
    if game_score <= 0:
        return {"ok": True, "submitted": 0, "best": int(load_ent()["bests"].get(str(user), 0))}
    with _ent_lock:
        d = load_ent()
        prev_best = int(d["bests"].get(str(user), 0))
        new_best = max(prev_best, game_score)
        delta = new_best - prev_best
        if delta > 0:
            payload = urllib.parse.urlencode({
                "user_id": user,
                "activity_id": ACTIVITY_POINTS,
                "value": delta,
                "access_token": service_token,
                "v": VK_API_VERSION,
            }).encode()
            req = urllib.request.Request(VK_API_URL + "secure.addAppEvent",
                                         data=payload, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    out = json.loads(resp.read())
            except OSError as err:
                raise HTTPException(status_code=502, detail=f"VK API unreachable: {err}")
            if out.get("error"):
                # e.g. 15: points table not configured in the app settings, 29: rate limit
                raise HTTPException(status_code=502,
                                    detail=f"VK API error {out['error'].get('error_code')}: {out['error'].get('error_msg')}")
            # only commit the new best after VK accepted the delta, so a
            # failed push can be re-covered by the next game
            d["bests"][str(user)] = new_best
            save_ent(d)
    print(f"VK score: game {game_score}, best {prev_best} -> {new_best} (delta {delta}) for user {user}", flush=True)
    return {"ok": True, "submitted": delta, "best": new_best}
