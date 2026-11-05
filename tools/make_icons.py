"""Generate the Glossa PWA icons (run from the repo root: python tools/make_icons.py [path/to/EBGaramond.ttf]).

The mark is a double-storey EB Garamond lowercase "g", paper on lapis. The font is not committed:
pass a TTF/OTF as the first argument or in the EB_GARAMOND_TTF environment variable
(the variable-weight file from https://github.com/google/fonts/tree/main/ofl/ebgaramond works).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

LAPIS = "#2e44a8"
PAPER = "#f4f5f7"
WEIGHT = 500


def font_path() -> str:
    path = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("EB_GARAMOND_TTF", "")
    if not path or not os.path.exists(path):
        sys.exit("Pass the EB Garamond TTF as an argument or set EB_GARAMOND_TTF.")
    return path


def load_font(path: str, px: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, px)
    try:
        f.set_variation_by_axes([WEIGHT])  # variable font: weight axis
    except (OSError, AttributeError):
        pass  # static font
    return f


def draw(path: str, size: int, scale: float = 1.0) -> Image.Image:
    """scale < 1 shrinks the mark towards the centre (maskable icons need an 80% safe zone)."""
    img = Image.new("RGB", (size, size), LAPIS)
    d = ImageDraw.Draw(img)
    s = size * scale
    f = load_font(path, int(s * 0.92))
    left, top, right, bottom = d.textbbox((0, 0), "g", font=f, anchor="ls")
    # centre the glyph's ink box in the square (it has a descender, so centre the box, not the baseline)
    x = (size - (right - left)) / 2 - left
    y = (size - (bottom - top)) / 2 - top
    d.text((x, y), "g", font=f, fill=PAPER, anchor="ls")
    return img


def make(path: str, size: int, out: str, scale: float = 1.0) -> None:
    # draw large and downsample, so small sizes stay crisp
    draw(path, 1024, scale).resize((size, size), Image.LANCZOS).save(out)


if __name__ == "__main__":
    p = font_path()
    make(p, 512, "web/public/icon-512.png")
    make(p, 192, "web/public/icon-192.png")
    make(p, 512, "web/public/icon-maskable-512.png", scale=0.78)
    make(p, 180, "web/public/apple-touch-icon.png")
    make(p, 64, "web/public/favicon.png")
