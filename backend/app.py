# Neon Nexus entitlement service (VK votes IAP: the `noads` good).
#
# The game is a fully static site; this service exists ONLY for the VK
# mini-app flavor of it (vk.com catalog). VK's payments bot calls the app's
# «URL для платёжных уведомлений ВКонтакте» with two callbacks:
#   get_item          — the goods catalog: title + price (votes) of `noads`
#   order_status_change (status=chargeable) — the actual purchase; the order
#                       is granted and confirmed by answering
#                       {"response": {"order_id": N}}
# Both are signature-verified with the app's «защищённый ключ» (same key the
# launch params are verified with). The client polls POST /api/vk/entitled
# with its raw launch params to confirm the grant landed.
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
#   VK_APP_SECRET / VK_PROTECTED_KEY   «защищённый ключ» from app settings
#   VK_SERVICE_TOKEN / VK_SERVICE_KEY  «сервисный ключ» (orders.get fallback)
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

VK_API_VERSION = "5.199"


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
    allowed = os.environ.get("VK_APP_ID", "").strip()
    if allowed and allowed != "0" and params.get("vk_app_id") != allowed:
        raise HTTPException(status_code=403, detail="launch params from another app")
    return {"user_id": user_id, "noads": user_has_noads(user_id)}


# ---------------- VK payments callbacks ----------------

def verify_callback_sig(params: dict, secret: str) -> bool:
    """Classic VK payments-callback signature: md5 over all params except
    `sig`, sorted by key, concatenated as key=value, with the secret appended."""
    if not secret or not params.get("sig"):
        return False
    items = sorted((k, str(v)) for k, v in params.items() if k not in ("sig", "sign"))
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

    allowed_app_ids = {os.environ.get("VK_APP_ID", "").strip()} - {"", "0"}
    if allowed_app_ids and params.get("app_id") and params.get("app_id") not in allowed_app_ids:
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
        return JSONResponse({"response": {
            "item_id": params.get("item"),
            "title": NOADS_TITLE,
            "price": NOADS_PRICE,
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
