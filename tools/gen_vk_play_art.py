#!/usr/bin/env python3
"""Generate the VK Play store art kit for Neon Nexus.

Every image is cut from one procedurally drawn hero scene (supersampled 2x),
so all formats share the same look as store-assets/icon_512.png and
feature_graphic_1024x500.png: navy starfield, synthwave grid, neon arrow ship,
glowing NEON NEXUS wordmark.

VK Play page-image specs (documentation.vkplay.ru, f2p_setups_vkp):
  horizontal cover  626x352  art + logo, no other text, no solid bg
  vertical cover    398x530  art + logo bottom-center
  background art    1544x380 art only, NO text
  loading image     1000x1000 art + optional loading text
Rule of thumb on the page: logo at the bottom, heroes to the right.

Run:  python3 tools/gen_vk_play_art.py
Out:  store-assets/vk-play/
"""

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store-assets", "vk-play")

CYAN = (0, 255, 255)
MAGENTA = (255, 45, 130)
ORANGE = (255, 158, 40)
PURPLE = (106, 63, 201)
NAVY_TOP = (12, 12, 34)
NAVY_BOT = (22, 22, 58)
WHITE = (255, 255, 255)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


# ---------------------------------------------------------------- primitives
def vertical_gradient(w, h, top, bot):
    img = Image.new("RGB", (1, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return img.resize((w, h))


def add_nebula(img, cx, cy, radius, color, alpha):
    """Soft radial glow composited under everything else."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
              fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    img.alpha_composite(layer)


def add_stars(img, n, seed=42, ymax_frac=1.0):
    w, h = img.size
    rng = random.Random(seed)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        x = rng.uniform(0, w)
        y = rng.uniform(0, h * ymax_frac)
        r = rng.choice([1, 1, 1, 2, 2, 3])
        a = rng.randint(60, 220)
        col = WHITE if rng.random() < 0.85 else rng.choice([CYAN, MAGENTA, ORANGE])
        d.ellipse([x - r, y - r, x + r, y + r], fill=col + (a,))
    img.alpha_composite(layer)


def add_grid(img, horizon_frac=0.60, seed=7):
    """Synthwave perspective grid below the horizon + glowing horizon line."""
    w, h = img.size
    hy = int(h * horizon_frac)
    vp = (w * 0.5, hy)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # verticals fanning from the vanishing point
    for i in range(-14, 15):
        x_bot = vp[0] + i * w * 0.09
        d.line([vp, (x_bot, h)], fill=PURPLE + (150,), width=max(2, w // 700))

    # horizontals, spacing compresses towards the horizon
    rows = 12
    for i in range(1, rows + 1):
        t = (i / rows) ** 2.1
        y = hy + t * (h - hy)
        a = int(60 + 130 * t)
        d.line([(0, y), (w, y)], fill=PURPLE + (a,), width=max(2, w // 800))

    img.alpha_composite(layer)

    # horizon line with glow
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dg = ImageDraw.Draw(glow)
    dg.line([(0, hy), (w, hy)], fill=CYAN + (230,), width=max(3, w // 450))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.004))
    img.alpha_composite(glow)
    d2 = ImageDraw.Draw(img)
    d2.line([(0, hy), (w, hy)], fill=(180, 255, 255, 255), width=max(2, w // 900))


def neon_polyline(img, pts, color, width, close=False, core=True):
    """Neon stroke: wide blurred halo + colored stroke + hot white core."""
    pts = [tuple(p) for p in pts]
    if close:
        pts = pts + [pts[0]]
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dh = ImageDraw.Draw(halo)
    dh.line(pts, fill=color + (200,), width=int(width * 2.6), joint="curve")
    halo = halo.filter(ImageFilter.GaussianBlur(width * 1.6))
    img.alpha_composite(halo)

    d = ImageDraw.Draw(img)
    d.line(pts, fill=color + (255,), width=width, joint="curve")
    if core:
        cwidth = max(2, width // 3)
        d.line(pts, fill=(240, 255, 255, 255), width=cwidth, joint="curve")


def draw_ship(img, cx, cy, scale, tilt=0.0):
    """The brand arrow ship: cyan outline, orange ^ chevron, magenta v chevron."""
    def rot(p):
        x, y = p
        return (cx + (x * math.cos(tilt) - y * math.sin(tilt)) * scale,
                cy + (x * math.sin(tilt) + y * math.cos(tilt)) * scale)

    hull = [(-0.62, 0.55), (0.0, -1.0), (0.62, 0.55), (0.0, 0.26)]
    chev_up = [(-0.30, -0.20), (0.0, -0.46), (0.30, -0.20)]
    chev_dn = [(-0.26, 0.34), (0.0, 0.62), (0.26, 0.34)]

    lw = max(3, int(scale * 0.085))
    neon_polyline(img, [rot(p) for p in hull], CYAN, lw, close=True)
    neon_polyline(img, [rot(p) for p in chev_up], ORANGE, max(3, int(lw * 0.8)))
    neon_polyline(img, [rot(p) for p in chev_dn], MAGENTA, max(3, int(lw * 0.8)))


def draw_tracer(img, x0, y0, x1, y1, color, width):
    neon_polyline(img, [(x0, y0), (x1, y1)], color, width, core=False)


def glow_text(img, text, cx, cy, size, color, tracking=0.14, fill=None):
    """Wordmark line centered on (cx, cy) — blurred color halo + core fill."""
    font = ImageFont.truetype(FONT_BOLD, size)
    tr = int(size * tracking)
    widths = []
    for ch in text:
        bb = font.getbbox(ch)
        widths.append(bb[2] - bb[0])
    total = sum(widths) + tr * (len(text) - 1)
    x = cx - total / 2

    def paint(draw, col):
        pen = x
        for ch, wch in zip(text, widths):
            draw.text((pen + wch / 2, cy), ch, font=font, fill=col + (255,),
                      anchor="mm")
            pen += wch + tr

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    paint(d, color)
    halo = layer.filter(ImageFilter.GaussianBlur(size * 0.22))
    img.alpha_composite(halo)
    img.alpha_composite(halo)  # double for intensity
    if fill:
        paint(d, fill)
    img.alpha_composite(layer)


def fit_size(text, max_w, tracking=0.14, cap=0.72):
    """Font size that fits `text` into max_w pixels (DejaVu Bold ~0.72em/char)."""
    return int(max_w / (len(text) * cap + (len(text) - 1) * tracking))


def draw_wordmark(img, cx, bottom_y, size, line_h=1.3):
    """NEON (cyan) over NEXUS (magenta), bottom-anchored at bottom_y."""
    font_ascent = size * 0.38  # half cap height of DejaVu Bold
    cy2 = bottom_y - font_ascent
    cy1 = cy2 - size * line_h
    glow_text(img, "NEON", cx, cy1, size, CYAN, fill=(235, 255, 255))
    glow_text(img, "NEXUS", cx, cy2, size, MAGENTA, fill=(255, 232, 242))


# ------------------------------------------------------------------- scenes
def base_scene(w, h, stars=140, horizon=0.60, seed=42):
    img = vertical_gradient(w, h, NAVY_TOP, NAVY_BOT).convert("RGBA")
    add_nebula(img, w * 0.22, h * 0.18, w * 0.20, CYAN, 34)
    add_nebula(img, w * 0.86, h * 0.30, w * 0.24, MAGENTA, 30)
    add_nebula(img, w * 0.55, h * 0.05, w * 0.16, (90, 60, 220), 26)
    add_stars(img, stars, seed=seed, ymax_frac=horizon + 0.05)
    add_grid(img, horizon_frac=horizon)
    return img


def scene_hero(w, h, ship_x=0.72, ship_y=0.44, ship_s=None, tracers=True):
    """Hero scene: ship on the right, a couple of neon tracers, dark center-left
    kept clean for the wordmark / store UI overlays."""
    img = base_scene(w, h)
    s = ship_s or h * 0.30
    cx, cy = w * ship_x, h * ship_y
    if tracers:
        # fire up-right, away from the wordmark zone (which sits left/below)
        draw_tracer(img, cx + s * 0.25, cy - s * 0.45, cx + s * 1.35, cy - s * 1.05,
                    MAGENTA, max(3, int(s * 0.035)))
        draw_tracer(img, cx + s * 0.45, cy - s * 0.15, cx + s * 1.65, cy - s * 0.55,
                    CYAN, max(3, int(s * 0.03)))
    draw_ship(img, cx, cy, s, tilt=0.12)
    return img


def scene_text(w, h, ship_x=0.72, ship_y=0.42, ship_s=None, text_cx=0.34,
               text_w=0.60, bottom_y=0.93):
    img = scene_hero(w, h, ship_x, ship_y, ship_s)
    size = min(int(h * 0.20), fit_size("NEXUS", int(w * text_w)))
    draw_wordmark(img, w * text_cx, h * bottom_y, size)
    return img


def save(img, name, out=OUT, quality=90):
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, name)
    if name.lower().endswith(".jpg"):
        img.convert("RGB").save(path, quality=quality, optimize=True)
    else:
        img.save(path, optimize=True)
    print(f"{name:36s} {img.size!s:12s} {os.path.getsize(path)//1024} KB")


def render(w, h, builder, ss=2):
    """Build at ss-fold supersampling, then LANCZOS downscale for crispness."""
    img = builder(w * ss, h * ss)
    return img.resize((w, h), Image.LANCZOS)


def main():
    # primary VK Play page images
    save(render(626, 352, lambda w, h: scene_text(w, h)), "horizontal-cover-626x352.png")
    save(render(398, 530, lambda w, h: scene_text(w, h, ship_x=0.5, ship_y=0.32,
                                                  text_cx=0.5, text_w=0.88,
                                                  bottom_y=0.95)),
         "vertical-cover-398x530.png")
    # background art: art only, no text, ship far right, calm center
    save(render(1544, 380, lambda w, h: scene_hero(w, h, ship_x=0.86, ship_y=0.46,
                                                   ship_s=h * 0.34)),
         "background-art-1544x380.png")
    # loading square
    def loading(w, h):
        img = base_scene(w, h, stars=160, horizon=0.66)
        s = h * 0.20
        draw_ship(img, w / 2, h * 0.42, s)
        glow_text(img, "ИГРА ЗАПУСКАЕТСЯ", w / 2, h * 0.66, int(h * 0.045),
                  CYAN, fill=(235, 255, 255))
        return img
    save(render(1000, 1000, loading), "loading-1000x1000.png")

    # legacy cabinet fields (older form revisions) — cheap to provide
    legacy = os.path.join(OUT, "legacy")
    save(render(630, 380, lambda w, h: scene_text(w, h)), "cover-630x380.jpg", legacy)
    save(render(2000, 1000, lambda w, h: scene_hero(w, h, ship_x=0.82, ship_y=0.42,
                                                    ship_s=h * 0.30)),
         "game-bg-2000x1000.jpg", legacy)
    icon = Image.open(os.path.join(ROOT, "store-assets", "icon_512.png")).convert("RGB")
    icon.resize((46, 46), Image.LANCZOS).save(os.path.join(legacy, "icon-46x46.png"),
                                              optimize=True)
    icon.resize((256, 256), Image.LANCZOS).save(os.path.join(legacy, "shortcut-icon-256x256.png"),
                                                optimize=True)
    for name in ("icon-46x46.png", "shortcut-icon-256x256.png"):
        p = os.path.join(legacy, name)
        print(f"legacy/{name:26s} {(46, 46) if '46' in name else (256, 256)!s:12s} "
              f"{os.path.getsize(p)//1024} KB")

    # VK mini-app catalog («Оформление» on dev.vk.ru) — same set the quiz uses
    cat = os.path.join(OUT, "vk-catalog")
    os.makedirs(cat, exist_ok=True)
    save(render(1120, 630, lambda w, h: scene_text(w, h, text_w=0.52)),
         "snippet-1120x630.png", cat)
    for side in (150, 278, 576):
        icon.resize((side, side), Image.LANCZOS).save(os.path.join(cat, f"icon-{side}.png"),
                                                      optimize=True)
    icon.resize((32, 32), Image.LANCZOS).save(os.path.join(cat, "favicon-32.png"),
                                              optimize=True)
    for name in ("snippet-1120x630.png", "icon-150.png", "icon-278.png",
                 "icon-576.png", "favicon-32.png"):
        p = os.path.join(cat, name)
        im = Image.open(p)
        print(f"vk-catalog/{name:24s} {str(im.size):12s} {os.path.getsize(p)//1024} KB")


if __name__ == "__main__":
    main()
