"""Generate the Glossa PWA icons (run from the repo root: python tools/make_icons.py [path/to/Onest.ttf]).

The mark is a lowercase "g" in Onest ExtraBold, ink on a white sheet, with a yellow highlighter swipe laid
under it. The font is not committed: pass a TTF as the first argument or in the ONEST_TTF environment
variable (the variable-weight file from https://github.com/google/fonts/tree/main/ofl/onest works).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

INK = "#18181b"
SHEET = "#ffffff"
MARKER = "#ffe94a"
WEIGHT = 800


def font_path() -> str:
    path = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ONEST_TTF", "")
    if not path or not os.path.exists(path):
        sys.exit("Pass the Onest TTF as an argument or set ONEST_TTF.")
    return path


def load_font(path: str, px: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, px)
    try:
        f.set_variation_by_axes([WEIGHT])  # variable font: weight axis
    except (OSError, AttributeError):
        pass  # static font
    return f


def swipe(size: int, box: tuple[float, float, float, float]) -> Image.Image:
    """A slightly tilted, round-ended highlighter band covering `box` (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    h = y1 - y0
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((x0, y0, x1, y1), radius=h * 0.38, fill=MARKER)
    return layer.rotate(2.5, resample=Image.BICUBIC, center=((x0 + x1) / 2, (y0 + y1) / 2))


def draw(path: str, size: int, scale: float = 1.0) -> Image.Image:
    """scale < 1 shrinks the mark towards the centre (maskable icons need an 80% safe zone)."""
    img = Image.new("RGBA", (size, size), SHEET)
    d = ImageDraw.Draw(img)
    s = size * scale
    f = load_font(path, int(s * 0.9))
    left, top, right, bottom = d.textbbox((0, 0), "g", font=f, anchor="ls")
    # centre the glyph's ink box in the square (it has a descender, so centre the box, not the baseline)
    x = (size - (right - left)) / 2 - left
    y = (size - (bottom - top)) / 2 - top
    gw, gh = right - left, bottom - top
    gx0, gy0 = x + left, y + top
    # the swipe sits behind the lower part of the bowl, a little wider than the glyph
    band = (gx0 - gw * 0.14, gy0 + gh * 0.50, gx0 + gw * 1.12, gy0 + gh * 0.80)
    img.alpha_composite(swipe(size, band))
    ImageDraw.Draw(img).text((x, y), "g", font=f, fill=INK, anchor="ls")
    return img.convert("RGB")


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
