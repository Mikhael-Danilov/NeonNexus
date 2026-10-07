# Deployment state (2026-10-07)

Host: `nyrds@45.132.176.250` (ssh key `~/.ssh/id_rsa_laptop`), serves
`https://ru.nyrds.net`. Same VPS/layout as chinese-word-quiz.

## Done

- **Static build** (RU-localized VK flavor, commit `ed2af5c`):
  `rsync -av --delete -e "ssh -i ~/.ssh/id_rsa_laptop" app/src/main/assets/ nyrds@45.132.176.250:/var/www/html/neon-nexus/`
  Verified live: `?vk_app_id` → RU («НАЧАТЬ ИГРУ», ФЛАГМАН, noads button);
  without the param → EN unchanged.
- **Entitlement API**: `/var/www/neon-nexus-api/backend` (app.py + .venv,
  python 3.12), systemd `neonnexus-api.service` (User=nyrds, port 8017,
  `EnvironmentFile=…/backend/.env`, `VK_APP_ID=54802003` baked in),
  enabled + running.
- **nginx** (`sites-available/default`, backup `default.bak-neonnexus-20261007`):
  `location = /neon-nexus/index.html` (no-cache) + `location ^~ /neon-nexus/api/`
  → `127.0.0.1:8017/api/`.
- Verified: `/api/health` → `{"ok":true}` (local + public); static assets,
  `privacy.html`, `img/noads-256.png`, woff2 (correct `font/woff2` MIME).

## Done later the same evening

- Real keys filled into `backend/.env` (owner completed the 2FA reveal),
  service restarted. End-to-end verified with correctly signed probes:
  `get_item` → catalog answer (title «Отключить рекламу», 15 голосов,
  photo, expiration 600), `order_status_change_test` chargeable → nested
  `{"response":{"order_id":N}}` + grant, `/api/vk/entitled` → `noads:true`,
  bad sig → error 10; service token validated via `orders.get` (empty list).
  Test grant removed afterwards — `entitlements.json` is empty again.

## OK payments pipeline (added 2026-10-07, verified)

Ported from the quiz (commit `2e56d77`-proven protocol): OK launcher
translates `VKWebAppShowOrderBox`, OK's bot speaks the VK protocol against
the VK notification URL with `app_id=51200515914` (accepted alongside
54802003) and is answered the ruble-parity price (`noads` = 15 голосов →
105 ОКов, `OK_RUB_PER_VOTE=7`); the `callbacks.payment` transaction lands on
`/api/ok/order` (md5 sig skipping empty params, `OK_APPLICATION_KEY` asserted
when set, amount asserted) and answers literal `true`; the OK-native uid is
resolved to vk_user_id via the boot-time `/api/ok/map` registration the
client does inside OK (launch params add `vk_ok_user_id`, HMAC-verified).
Verified with signed probes: OK get_item → 105, map → true, transaction →
`true` + grant, entitled (OK launch params) → `noads:true`; journal shows
uid→user resolution. Test artifacts cleaned.

Remaining OK-side (needs apiok.ru access):
1. «URL для платёжных уведомлений» of the OK app = `https://ru.nyrds.net/neon-nexus/api/ok/order`.
2. `VALUABLE_ACCESS` from api-support@ok.ru — per-app payment permission;
   without it order creation fails with the generic payment error.
3. Optional: fill `OK_APPLICATION_KEY` in backend/.env (from apiok.ru) —
   asserted when set.

## Remaining

1. Console URLs (dev.vk.com):
   - «URL для платёжных уведомлений ВКонтакте»:
     `https://ru.nyrds.net/neon-nexus/api/vk/order`
   - iframe/загрузка URL: `https://ru.nyrds.net/neon-nexus/`
2. Main-admin test buy (VK votes, tester mode) → verify the real order lands
   in `entitlements.json`.
3. Then catalog submission per `VK-MINIAPP-CATALOG.md` §4.

Probe gotcha that cost time: the get_item/chargeable signature base is the
key-sorted `k=v` CONCATENATION WITHOUT `&` separators — hashing the query
string (with `&`) produces a valid-looking but rejected signature.
