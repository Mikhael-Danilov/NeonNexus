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

## Remaining (blocked on VK 2FA — needs the account owner)

1. Fill `/var/www/neon-nexus-api/backend/.env` (chmod 600, owner nyrds) with
   the real keys: dev.vk.com → Neon Nexus (54802003) → Настройки → Разработка
   → Ключи доступа → «Показать» under Защищённый ключ / Сервисный ключ.
   The reveal demands phone validation (error 6100, push to the phone's VK
   app) — confirmed via `devAdmin.getAppSecretKey`, not bypassable.
   Then: `sudo systemctl restart neonnexus-api`.
2. Console URLs (do together with step 1):
   - «URL для платёжных уведомлений ВКонтакте»:
     `https://ru.nyrds.net/neon-nexus/api/vk/order`
   - iframe/загрузка URL: `https://ru.nyrds.net/neon-nexus/`
3. Main-admin test buy (VK votes, tester mode) → verify `get_item` answers
   and the grant lands in `entitlements.json`.
4. Then catalog submission per `VK-MINIAPP-CATALOG.md` §4.

Until step 1 is done the API answers `/api/health` normally but payment
callbacks return `{"error_code":300,"payments not configured"}` and
`/api/vk/entitled` reports not configured — deliberate clean failure, no
secrets on disk.
