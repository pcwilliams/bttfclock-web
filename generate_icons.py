#!/usr/bin/env python3
"""Generates the PWA / home-screen icons for Time Circuits (web).

Three LED rows (red, green, amber) on a brushed-metal tile, drawn with the
same beveled-hexagon 7-segment geometry as js/models/segmentGeometry.js.
Rendered at 4x and downsampled for antialiasing. Images are RGB (no
alpha): iOS strips alpha from touch icons and composites badly otherwise.

    python3 generate_icons.py

Writes icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png
and icons/apple-touch-icon.png (180).
"""

import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SS = 4  # supersampling factor

# Same sRGB values as js/models/rowColor.js
ROWS = [
    {"text": "01:21", "lit_core": (1.00, 0.55, 0.45), "bloom": (1.00, 0.16, 0.10), "ghost": (0.22, 0.04, 0.04)},
    {"text": "09:21", "lit_core": (0.70, 1.00, 0.75), "bloom": (0.23, 1.00, 0.30), "ghost": (0.04, 0.16, 0.06)},
    {"text": "04:21", "lit_core": (1.00, 0.90, 0.55), "bloom": (1.00, 0.70, 0.10), "ghost": (0.20, 0.12, 0.02)},
]

SEVEN = {
    "0": 0b0111111, "1": 0b0000110, "2": 0b1011011, "3": 0b1001111, "4": 0b1100110,
    "5": 0b1101101, "6": 0b1111101, "7": 0b0000111, "8": 0b1111111, "9": 0b1101111,
}

THICKNESS = 0.18
SKEW = 0.10
ASPECT = 0.58


def rgb(c, k=1.0):
    return tuple(max(0, min(255, round(v * 255 * k))) for v in c)


def seven_polys(w, h):
    """Port of sevenSegmentPolygons(): seven 6-point bars, y-down, italic."""
    t = min(w, h) * THICKNESS
    gap = t * 0.18
    mid_y = h / 2
    lx, rx, ty, by = t / 2, w - t / 2, t / 2, h - t / 2

    def horiz(cy, x0, x1):
        b = t / 2
        return [(x0, cy), (x0 + b, cy - t / 2), (x1 - b, cy - t / 2), (x1, cy), (x1 - b, cy + t / 2), (x0 + b, cy + t / 2)]

    def vert(cx, y0, y1):
        b = t / 2
        return [(cx, y0), (cx + t / 2, y0 + b), (cx + t / 2, y1 - b), (cx, y1), (cx - t / 2, y1 - b), (cx - t / 2, y0 + b)]

    polys = [
        horiz(ty, lx + t, rx - t),
        vert(rx, ty + gap, mid_y - gap),
        vert(rx, mid_y + gap, by - gap),
        horiz(by, lx + t, rx - t),
        vert(lx, mid_y + gap, by - gap),
        vert(lx, ty + gap, mid_y - gap),
        horiz(mid_y, lx + t * 0.7, rx - t * 0.7),
    ]
    return [[(x + SKEW * (h - y), y) for x, y in p] for p in polys]


def brushed(draw, box, stops, seed, streak):
    x0, y0, x1, y1 = box
    rnd = random.Random(seed)
    h = y1 - y0
    for y in range(y0, y1):
        f = (y - y0) / max(1, h - 1)
        i = min(len(stops) - 2, int(f * (len(stops) - 1)))
        lf = f * (len(stops) - 1) - i
        base = [stops[i][k] * (1 - lf) + stops[i + 1][k] * lf for k in range(3)]
        n = (rnd.random() - 0.5) * streak
        draw.line([(x0, y), (x1, y)], fill=rgb([v + n for v in base]))


def render(size, content_scale):
    S = size * SS
    base = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(base)
    # Full-bleed dark chassis (platforms apply their own corner mask).
    brushed(d, (0, 0, S, S), [(0.11, 0.11, 0.10), (0.06, 0.06, 0.05), (0.04, 0.04, 0.04), (0.08, 0.08, 0.07)], 1985, 0.025)

    glow = Image.new("RGB", (S, S))
    gd = ImageDraw.Draw(glow)

    cw = S * content_scale             # content block width
    row_h = cw * 0.27
    gap = cw * 0.05
    block_h = row_h * 3 + gap * 2
    left = (S - cw) / 2
    top = (S - block_h) / 2

    for r, row in enumerate(ROWS):
        y = top + r * (row_h + gap)
        # Row panel and the recessed black window.
        d.rounded_rectangle([left, y, left + cw, y + row_h], radius=row_h * 0.12, fill=rgb((0.26, 0.26, 0.24)))
        pad = row_h * 0.10
        wx0, wy0, wx1, wy1 = left + pad, y + pad, left + cw - pad, y + row_h - pad
        d.rounded_rectangle([wx0, wy0, wx1, wy1], radius=row_h * 0.06, fill=rgb((0.02, 0.02, 0.02)))

        dh = (wy1 - wy0) * 0.84
        dw = dh * ASPECT
        char_gap = dw * 0.26
        colon_w = dw * 0.45
        text_w = 4 * dw + 2 * char_gap + colon_w + 2 * char_gap
        x = (wx0 + wx1) / 2 - text_w / 2 - dh * SKEW / 2
        dy = (wy0 + wy1) / 2 - dh / 2
        for ch in row["text"]:
            if ch == ":":
                cx = x + char_gap + colon_w / 2
                rad = dw * 0.11
                for cy in (dy + dh * 0.33, dy + dh * 0.67):
                    cxs = cx + SKEW * (dh - (cy - dy))
                    box = [cxs - rad, cy - rad, cxs + rad, cy + rad]
                    d.ellipse(box, fill=rgb(row["lit_core"]))
                    gd.ellipse(box, fill=rgb(row["bloom"]))
                x += colon_w + 2 * char_gap
                continue
            mask = SEVEN[ch]
            for i, poly in enumerate(seven_polys(dw, dh)):
                pts = [(x + px, dy + py) for px, py in poly]
                lit = (mask >> i) & 1
                d.polygon(pts, fill=rgb(row["lit_core"] if lit else row["ghost"]))
                if lit:
                    gd.polygon(pts, fill=rgb(row["bloom"]))
            x += dw + char_gap

    # Two-radius glow, like the app's stacked .shadow layers.
    halo = ImageChops.add(
        glow.filter(ImageFilter.GaussianBlur(S * 0.006)).point(lambda v: int(v * 0.55)),
        glow.filter(ImageFilter.GaussianBlur(S * 0.018)).point(lambda v: int(v * 0.45)),
    )
    out = ImageChops.add(base, halo)
    return out.resize((size, size), Image.LANCZOS)


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
    os.makedirs(out_dir, exist_ok=True)
    targets = [
        ("icon-192.png", 192, 0.86),
        ("icon-512.png", 512, 0.86),
        ("apple-touch-icon.png", 180, 0.86),
        # Maskable: keep the artwork inside the central 80% safe circle.
        ("icon-maskable-512.png", 512, 0.70),
    ]
    for name, size, scale in targets:
        path = os.path.join(out_dir, name)
        render(size, scale).save(path, optimize=True)
        print("wrote", path)


if __name__ == "__main__":
    main()
