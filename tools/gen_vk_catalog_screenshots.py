#!/usr/bin/env python3
"""VK mini-app catalog screenshots from the real gameplay captures.

The dev.vk.com catalog form asks for desktop screenshots 1200x600 (x3) and
mobile 1080x1920 (x3). The raw captures in store-assets/screenshots/ are
1920x1080, so:

  desktop: center 1920x960 band  -> 1200x600          (keeps score + slots)
  mobile:  607x1080 strip around the action -> x1.78 upscale to 1080x1920

Run:    python3 tools/gen_vk_catalog_screenshots.py
Out:    store-assets/vk-play/vk-catalog/desktop-*.png, mobile-*.png
Needs:  pip install pillow
"""
import os

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "store-assets", "screenshots")
OUT = os.path.join(ROOT, "store-assets", "vk-play", "vk-catalog")

# source file -> (label, x-center of the 607px mobile strip, px)
SHOTS = {
    "01_start_screen.png": ("1-start", 960),
    "03_combat.png": ("2-combat", 900),
    "05_game_over.png": ("3-game-over", 960),
}


def crop_desktop(im):
    w, h = im.size
    band_h = w // 2                       # 2:1 band, biased up to keep the score line whole
    top = max(0, (h - band_h) // 2 - 22)
    band = im.crop((0, top, w, top + band_h))
    return band.resize((1200, 600), Image.LANCZOS)


def crop_mobile(im, focus_x):
    w, h = im.size
    strip_w = round(h * 607 / 1080)       # 607x1080 at 1920x1080
    left = min(max(0, focus_x - strip_w // 2), w - strip_w)
    strip = im.crop((left, 0, left + strip_w, h))
    big = strip.resize((1080, 1920), Image.LANCZOS)
    return big.filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))


def main():
    os.makedirs(OUT, exist_ok=True)
    for src_name, (label, focus_x) in SHOTS.items():
        im = Image.open(os.path.join(SRC, src_name)).convert("RGB")

        d = crop_desktop(im)
        d_name = f"desktop-{label}.png"
        d.save(os.path.join(OUT, d_name), optimize=True)

        m = crop_mobile(im, focus_x)
        m_name = f"mobile-{label}.png"
        m.save(os.path.join(OUT, m_name), optimize=True)

        for name, img in ((d_name, d), (m_name, m)):
            p = os.path.join(OUT, name)
            print(f"{name:26s} {str(img.size):12s} {os.path.getsize(p) // 1024} KB")


if __name__ == "__main__":
    main()
