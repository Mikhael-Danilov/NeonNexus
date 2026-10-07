# Publishing Neon Nexus as a VK mini app (catalog listing)

The game ships **both** ways from the same static build: as a browser game on
VK Play (`deploy/VK-PLAY-PUBLISHING.md`) and as a **VK mini app** in the
vk.com catalog — same hosting, same URL, direct link
`https://vk.com/app<APP_ID>`. The mini-app side is already wired in the
build: `vk-bridge.min.js` is vendored and `VKWebAppInit` is sent when the
launch URL carries `vk_app_id` (without it the platform spinner never
clears) — `app/src/main/assets/index.html`. This is the same model the
Chinese quiz ships (`chinese-word-quiz`, app 54767583); its round-1
moderation experience is distilled into the checklist below.

## 1. Host (already covered by the VK Play deploy)

```bash
scripts/deploy-vkplay-web.sh user@your-host /var/www/html/neon-nexus/
```

`privacy.html` is part of the build and rides along — the catalog form
requires its URL.

## 2. Create the mini app

dev.vk.com → «Мини-приложения» → «Создать»:

1. Type: **Мини-приложение**, category — Игра.
2. «Адрес iframe» / base domain: the same HTTPS URL as for VK Play,
   `https://<host>/neon-nexus/` (index.html is the entry).
3. Set visibility to «всем пользователям» before submitting for moderation.
4. The direct link `https://vk.com/app<APP_ID>` works immediately — share it
   with testers while the catalog review is pending.

## 3. «Оформление» — art mapping

Upload from `store-assets/vk-play/vk-catalog/` (regenerate art:
`python3 tools/gen_vk_play_art.py`, screenshots:
`python3 tools/gen_vk_catalog_screenshots.py`):

| Form field | File | Spec |
|---|---|---|
| Универсальная иконка | `icon-576.png` | 576×576 png |
| Иконка каталога/сниппета | `icon-278.png` | 278×278 png (VK allows changing it at most once per 2 weeks) |
| Малая иконка | `icon-150.png` | 150×150 png |
| Favicon | `favicon-32.png` | 32×32 png |
| Большой сниппет | `snippet-1120x630.png` | 1120×630 png |
| Скриншоты | `desktop-1-action.png`, `desktop-2-combat.png`, `desktop-3-game-over.png` | 1200×600, «Изображения» tab → «Скриншоты» |

Screenshot section facts learned by doing (app 54802003, 2026-10-07):

* The form has a single **Ориентация** radio (Альбомная / Книжная) — one set
  of screenshots total, not separate desktop/mobile sets. Landscape is the
  right pick: the section header says they are shown on the game launch
  screen **in the desktop version of the site**. Switching the radio
  warns that already-uploaded screenshots will be deleted.
* 3 slots render initially and uploads persist there; slots added via
  «Загрузить ещё» accept a file and even show the «Скриншот загружен»
  toast, but **do not survive a page reload** — VK drops them server-side.
  Upload into the initial 3 slots (they render empty on a fresh
  «Оформление» page; after removal of a filled one the empty-slot input
  only exists after clicking «Загрузить ещё»).
* The `mobile-*.png` files (1080×1920) are generated for completeness /
  other stores — the mini-app catalog form has no place for them.
* Uploads auto-save; there is no «Сохранить» button on «Оформление».

## 4. «Размещение в каталоге» — questionnaire

All texts ready to paste: `deploy/listing-vk-miniapp-ru.md` (base) and
`deploy/listing-vk-miniapp-en.md` (EN fields) — name, slogan (≤32), short
description (≤108), full description, category «Игры → Аркады», keywords,
age label **6+**. Privacy policy URL: `https://<host>/neon-nexus/privacy.html`.
Submit; paste the moderator comment from the RU file.

## 4b. Payments / ads wiring (VK only)

The VK flavor of the build shows an interstitial after every finished game
(`VKWebAppShowNativeAds`; VK may frequency-cap on its side) and sells a
one-time «disable ads» for votes (`VKWebAppShowOrderBox`, good **`noads`**,
15 votes — price lives in `backend/app.py` as `NN_NOADS_PRICE`). Console setup:

1. Deploy the entitlement service (the goods catalog IS the `get_item`
   callback — there is no goods registry in any console):

   ```bash
   rsync -av backend/ user@your-host:/var/www/neon-nexus-api/backend/
   ssh user@your-host
   cd /var/www/neon-nexus-api/backend
   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   # .env: VK_APP_SECRET=<защищённый ключ>, VK_SERVICE_TOKEN=<сервисный ключ>
   cp ../deploy/neonnexus-api.service /etc/systemd/system/   # adjust User/paths
   systemctl daemon-reload && systemctl enable --now neonnexus-api
   curl -s http://127.0.0.1:8017/api/health     # {"ok":true}
   ```

2. dev.vk.com → app settings → «URL для платёжных уведомлений ВКонтакте»:
   `https://<host>/neon-nexus/api/vk/order` (GET and POST both handled:
   `get_item`, `order_status_change`, tester `_test` variants, orders.get
   fallback for the html-escape sig quirk — all per the quiz-proven
   protocol; see the header of `backend/app.py`).
   For the OK copy of the app (apiok.ru): «URL для платёжных уведомлений» =
   `https://<host>/neon-nexus/api/ok/order` — OK's bot speaks the same VK
   protocol there with the OK app id and ruble-parity price, plus
   `callbacks.payment` transactions (uid mapped to vk_user_id via the
   client's boot-time /api/ok/map call). OK also needs `VALUABLE_ACCESS`
   from api-support@ok.ru before its payments work at all.

3. nginx: the `^~ /neon-nexus/api/` location in
   `deploy/nginx-vkplay.conf.example` proxies to 127.0.0.1:8017.

4. Ads: no console setup exists — `VKWebAppShowNativeAds` serves
   automatically once the app is catalogued; before that requests may
   no-fill silently (expected). Payout office (Настройки → Монетизация,
   cashout.vk.com, creator-only) makes the revenue payable.

## 5. Moderation checklist mapped to the game

Rules referenced by number are the catalog rules the quiz was dinged on in
its round-1 review — expect the same reviewer attention.

| Rule / topic | Neon Nexus status |
|---|---|
| Launches, no extra installs | static site, `VKWebAppInit` on launch ✓ |
| Third-party links / sharing | none anywhere in the UI ✓ (no share feature at all) |
| Exit to menu (quiz remark #3) | ⌂ MENU pill top-left, two-tap confirm → reload to the start screen; «PLAY AGAIN» also returns there ✓ |
| Sound off control (2.2.5) | 🔊/🔇 on the start screen and in the HUD (next to `i`), mutes Tone's master output, preference persisted + synced ✓ |
| Progress sync across platforms (2.3.8) | high scores, kill counts, sound and the noads flag are mirrored through `VKWebAppStorageSet/Get` (`nn-*` keys), merged by maximum on every load ✓ |
| Monetization (4.2.1) | interstitial after every game + one-time `noads` purchase (15 votes) ✓ — `get_item`/order callbacks must be live before submission |
| Age labeling | 6+ in the questionnaire ✓ |
| Privacy policy URL | required field; `privacy.html` ships with the build ✓ |

Everything above is implemented; the pre-submission work left is purely
operational (deploy the API service, set the two console URLs). A catalog
rejection just returns the app to editing, nothing is lost.

## 6. After approval

* Catalog page goes live; the game keeps working via the direct link either way.
* Register the payout office (app settings → «Монетизация», creator-only) so
  ad/IAP revenue becomes payable.
* Follow-ups: platform leaderboards, achievements, OK publication of the
  same mini app (OK's launcher translates the VK bridge including
  `VKWebAppShowOrderBox`; the quiz is published to OK this way — protocol
  notes in the global AGENTS.md).
