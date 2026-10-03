# VK Play store art kit

Images for the game page on [VK Play](https://vkplay.ru), cut from one
procedurally drawn hero scene (same brand as the Play Store icon/feature
graphic). Specs from the official dev-cabinet docs
(`documentation.vkplay.ru`, section f2p → «Оформление страницы»).

Regenerate: `python3 tools/gen_vk_play_art.py`
Screenshots: `store-assets/vk-play/screenshots/` (re-encoded from
`store-assets/screenshots/` to stay under the 500 KB jpg/png limit).

| File | Cabinet field («Страница» → «Изображения») | Spec |
|---|---|---|
| `horizontal-cover-626x352.png` | Горизонтальная обложка | 626×352, jpg/png/webp ≤10 MB |
| `vertical-cover-398x530.png` | Вертикальная обложка | 398×530, logo bottom-center |
| `background-art-1544x380.png` | Фоновый арт | 1544×380, **no text at all** |
| `loading-1000x1000.png` | Картинка ожидания запуска (optional) | 1000×1000, art + loading text |
| `screenshots/1..5-*.jpg` | Скриншоты (4–15 per locale) | 16:9, jpg/png ≤500 KB |

`legacy/` covers fields from older cabinet revisions — upload only if the form
asks for them:

| File | Field | Spec |
|---|---|---|
| `legacy/cover-630x380.jpg` | Обложка (old form) | 630×380 |
| `legacy/game-bg-2000x1000.jpg` | Фон игры (old form) | 2000×1000 |
| `legacy/icon-46x46.png` | Иконка (old form) | 46×46 png ≤20 KB |
| `legacy/shortcut-icon-256x256.png` | Иконка ярлыка | 256×256 png |

## Rules the artwork already follows (moderation checklist)

* Covers carry only the project name "NEON NEXUS" — that is the only text
  allowed on covers, and it must be readable.
* No solid white/black/gray background, no border frames. The navy starfield +
  synthwave grid is intentionally non-uniform.
* Background art has no text and no hero in the central content area (ship is
  far right); dark shades are fine there — light background shades are the
  forbidden ones.
* Logo at the bottom / heroes to the right, so store UI overlays don't cover
  anything important.

## Optional, not in the kit

* **Превью (hover video)** — 334×186..342×190 webm ≤1.5 MB, ≤10 s, no sound,
  gameplay only, no screenshots/logos. Record ~10 s of real gameplay, scale to
  342×190, mute, export webm (`ffmpeg -i in.mp4 -vf scale=342:190 -an out.webm`).
  Optional — the page ships fine without it.
* Screenshots contain English UI text, so per the docs they belong in the EN
  locale; upload them once there (base-locale screenshots are shared across
  locales when the other locale has none of its own).
