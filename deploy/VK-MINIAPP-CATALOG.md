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
| Скриншоты (desktop) | `desktop-1-start.png`, `desktop-2-combat.png`, `desktop-3-game-over.png` | 1200×600 ×3 |
| Скриншоты (mobile) | `mobile-1-start.png`, `mobile-2-combat.png`, `mobile-3-game-over.png` | 1080×1920 ×3 (mobile section, if asked) |

## 4. «Размещение в каталоге» — questionnaire

All texts ready to paste: `deploy/listing-vk-miniapp-ru.md` (base) and
`deploy/listing-vk-miniapp-en.md` (EN fields) — name, slogan (≤32), short
description (≤108), full description, category «Игры → Аркады», keywords,
age label **6+**. Privacy policy URL: `https://<host>/neon-nexus/privacy.html`.
Submit; paste the moderator comment from the RU file.

## 5. Moderation checklist mapped to the game

Rules referenced by number are the catalog rules the quiz was dinged on in
its round-1 review — expect the same reviewer attention.

| Rule / topic | Neon Nexus status |
|---|---|
| Launches, no extra installs | static site, `VKWebAppInit` on launch ✓ |
| Third-party links / sharing | none anywhere in the UI ✓ (no share feature at all) |
| Exit to menu | start screen shows controls; game over → «PLAY AGAIN» reloads to the start screen. **No in-run exit button** — a reviewer may ask for one (quiz's remark #3; their fix: a two-tap «⌂ Меню» pill). Add if flagged. |
| Sound off control (2.2.5) | **MISSING** — no mute toggle in the HUD (Tone.js synths, no mute). High-risk remark; fix = a 🔊/🔇 button calling `Tone.Destination.mute`, preference persisted next to the high scores. |
| Progress sync across platforms (2.3.8) | **RISK** — high scores + kill counts live only in `localStorage`. The quiz was rejected over this; fix = mirror both keys through `VKWebAppStorageSet/Get` with merge-on-load (quiz's implementation is the reference). |
| Monetization (4.2.1) | no payments, no ads — if the reviewer demands monetization for a game listing (the quiz hit this), the minimal answer is VK native ads via `VKWebAppShowNativeAds` (`reward` on the blink cooldown / `interstitial` after game over); payout office is creator-only, cashout.vk.com. Decide before submitting, not after. |
| Age labeling | 6+ in the questionnaire ✓ |
| Privacy policy URL | required field; `privacy.html` ships with the build ✓ |

The two bolded gaps are code changes, not listing text — do them before
submission if you want a calm first review, otherwise be ready to resubmit
(a catalog rejection just returns the app to editing, nothing is lost).

## 6. After approval

* Catalog page goes live; the game keeps working via the direct link either way.
* Follow-ups in order of value: platform leaderboards (`VKWebAppStorage` first —
  it doubles as the 2.3.8 fix), achievements, VK votes IAP if we monetize
  (order-box protocol notes live in the global AGENTS.md), OK publication of
  the same mini app (OK launcher translates the VK bridge; the quiz is
  published to OK this way).
