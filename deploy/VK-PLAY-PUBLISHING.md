# Publishing Neon Nexus to VK Play (browser game)

Target: the **Браузерная** (browser) project type on
[developers.vkplay.ru](https://developers.vkplay.ru/) — the game is iframe-
hosted on our own HTTPS server, the same model the Chinese quiz uses for its
VK catalog listing. The public page becomes `https://vkplay.ru/app/[GMRID]`
and iframes our URL. Sources: official dev docs
(`documentation.vkplay.ru`, f2p section: «Создание проекта», «Подготовка
страницы игры» [f2pb], «Оформление страницы», «Модерация и публикация»).

Key platform facts (from the docs, 2026-10):

* Project type (client vs browser) **cannot be changed after creation**.
* Browser games publish the page **together with the iFrame link** — the link
  must be live before sending to moderation.
* The platform appends `?sign=…&uid=…&appid=…&currency=…&lang=…` to the iframe
  URL. Neon Nexus ignores query params and works as-is.
* JS API (postMessage) is only needed for platform auth / registration /
  payments. **Not integrated in v1**: the game is fully client-side, saves
  high scores in `localStorage`, has no payments. Revisit if we add
  leaderboards or IAP.
* Moderation: technical ≤5 working days, then marketing ≤3 (queues, not
  durations). A tech rejection resets the project to «Конфигурация» — fix and
  resubmit.
* Monetization models: free-to-play (default) / premium / **некоммерческий
  проект** (no price, no IAP, gets its own catalog collection). For v1 either
  F2P with no payments wired, or некоммерческий — decide at creation.

## 1. Host the web build

The build is exactly `app/src/main/assets/` (static site: `index.html`, `js/`,
`fonts/`, ~613 KB, no external requests — fonts are self-hosted, libraries
vendored; the only URLs in the sources are code comments).

```bash
# DEST=/var/www/html/neon-nexus/ user@your-host
scripts/deploy-vkplay-web.sh user@your-host /var/www/html/neon-nexus/
```

`deploy/nginx-vkplay.conf.example` shows the server block (correct `woff2`
MIME type + cache headers). Serve over **HTTPS** (the iframe URL must be
https). Verify the game loads and plays at the public URL directly, then
double-check it also runs inside an iframe, e.g.:

```html
<iframe src="https://<host>/neon-nexus/?sign=x&uid=1&appid=1&currency=RUB&lang=ru_RU"
        style="width:100%;height:600px" allowfullscreen></iframe>
```

## 2. Create the project

Cabinet → «Игры» → «Добавить»:

1. Name: `Neon Nexus`.
2. Type: **Браузерная** (irreversible!).
3. Model: free-to-play (default) or «Некомерческий проект» — no payments in
   v1 either way.

## 3. Fill the page («Страница»)

**Locales.** RU is the base locale (enough for RU/CIS visibility); add EN —
the screenshots carry English UI text, so they are uploaded in the EN locale.
All texts per locale: `deploy/listing-vk-play-ru.md`,
`deploy/listing-vk-play-en.md` — name, alternative names, short-description
header (≤43), short description (≤344), full description (≤10 000), age
rating (**6+**), system requirements (browser + WebGL).

**Images** («Изображения») — upload from `store-assets/vk-play/` (see its
README for field mapping): horizontal cover 626×352, vertical cover 398×530,
background art 1544×380 (no text), loading image 1000×1000 (optional). The
built-in image editor can crop/resize on upload if a size drifts.

**Screenshots** («Скриншоты и видео») — 4–15 per locale, 16:9, ≤500 KB:
`screenshots/1..5-*.jpg` (1920×1080, 59–170 KB). Upload once in the EN
locale. Video is optional; skip for v1.

**Countries** («Страны») — RU + CIS for the first release.

## 4. Wire the iFrame link

Project → «Основные свойства» → «Системные свойства»: put the public URL
(`https://<host>/neon-nexus/`) into **«Ссылка на страницу для отображения в
iFrame»**. That is the whole integration for v1.

## 5. Submit («Публикация»)

Choose automatic or manual publication, add the moderator comment from
`deploy/listing-vk-play-ru.md` (controls walkthrough — the reviewer must be
able to actually play it).

### Tech moderation checklist mapped to the game

| Checklist item | Neon Nexus status |
|---|---|
| Launches, no extra installs | static site, runs in browser |
| Non-standard resolutions | responsive canvas + pinch zoom; landscape layout |
| Exit option / controls info | start-screen instructions, `i` info button in HUD, game-over screen returns to menu |
| No freeze on minimize/restore | requestAnimationFrame pauses with the tab; state kept in JS |
| Progress saving | high scores + weapon unlocks in `localStorage`; no long-term meta progress (endless arcade) |
| Settings persist | sound/mode preferences persist per browser session of the page |
| No critical bugs | release smoke test `scripts/release-smoke-test.py` + CI screenshots |
| Enough content | 4 weapons, 7 enemy types, powerups, turrets, combo system, endless scaling |
| No third-party payments / SDKs / external links | none; no ads in the web build (AdMob is Android-Play-only and must stay out) |
| Age labeling | 6+, see listing |

### Marketing moderation checklist

Covers with readable name and no extra text, no solid white/black/gray
backgrounds, no frames — the generated kit follows this by construction.
Support contacts: fill a working email in project settings. Alternative names:
skip on first moderation if unsure (docs' advice) — they can be added later.

## 6. After approval

Page goes live at `https://vkplay.ru/app/[GMRID]`. Follow-ups, in order of
value: hover-preview webm (store-assets README has the recipe), JS API auth +
platform leaderboards, achievements, IAP if we go F2P-with-payments.
