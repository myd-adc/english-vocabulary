"""Generate the PWA icons (run from the repo root on macOS: python tools/make_icons.py).

The mark is a dictionary pronunciation: a serif "d" with the IPA stress mark before it, as in
/ˈdɪk/. Paper on the app's ink green; Iowan Old Style Black, which is also in the app's serif stack.
"""
from PIL import Image, ImageDraw, ImageFont

FONT = ("/System/Library/Fonts/Supplemental/Iowan Old Style.ttc", 4)  # Iowan Old Style Black
INK = "#1f5a47"
PAPER = "#f2f3ef"


def draw(size: int, scale: float = 1.0) -> Image.Image:
    """scale < 1 shrinks the mark towards the centre (maskable icons need an 80% safe zone)."""
    img = Image.new("RGB", (size, size), INK)
    d = ImageDraw.Draw(img)
    s = size * scale
    f = ImageFont.truetype(FONT[0], int(s * 0.70), index=FONT[1])
    left, top, right, _ = d.textbbox((0, 0), "d", font=f, anchor="ls")
    height = -top
    x = (size - (right - left)) / 2 + s * 0.06 - left
    y = size / 2 + height / 2 - s * 0.01
    d.text((x, y), "d", font=f, fill=PAPER, anchor="ls")
    # stress mark: a thin upright stroke at ascender height, just before the letter
    stroke_w, stroke_h = max(1.0, s * 0.028), s * 0.15
    sx, sy = x + left - s * 0.12, y - height + s * 0.01
    d.rectangle([sx, sy, sx + stroke_w, sy + stroke_h], fill=PAPER)
    return img


def make(size: int, path: str, scale: float = 1.0) -> None:
    # draw large and downsample, so small sizes stay crisp
    draw(1024, scale).resize((size, size), Image.LANCZOS).save(path)


make(512, "web/public/icon-512.png")
make(192, "web/public/icon-192.png")
make(512, "web/public/icon-maskable-512.png", scale=0.78)
make(180, "web/public/apple-touch-icon.png")
make(64, "web/public/favicon.png")
