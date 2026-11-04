"""Generate the PWA icons: a serif monogram on ink green (run from the repo root: python tools/make_icons.py)."""
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
INK = "#1f5a47"
PAPER = "#f2f3ef"


def make(size: int, path: str) -> None:
    img = Image.new("RGB", (size, size), INK)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, int(size * 0.52))
    d.text((size * 0.5, size * 0.47), "Lv", font=f, fill=PAPER, anchor="mm")
    # thin rule under the monogram, like a headword underline in a dictionary
    y = int(size * 0.74)
    d.line([(size * 0.27, y), (size * 0.73, y)], fill=PAPER, width=max(1, size // 128))
    img.save(path)


make(512, "web/public/icon-512.png")
make(192, "web/public/icon-192.png")
make(180, "web/public/apple-touch-icon.png")
make(64, "web/public/favicon.png")
