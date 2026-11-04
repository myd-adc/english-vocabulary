"""Generate the PWA icons (run once: python tools_make_icons.py)."""
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def make(size: int, path: str) -> None:
    img = Image.new("RGB", (size, size), "#0071e3")
    d = ImageDraw.Draw(img)
    # soft darker lower band for depth
    d.rectangle([0, int(size * 0.62), size, size], fill="#0066cc")
    f = ImageFont.truetype(FONT, int(size * 0.46))
    small = ImageFont.truetype(FONT, int(size * 0.17))
    d.text((size * 0.5, size * 0.40), "Aa", font=f, fill="white", anchor="mm")
    d.text((size * 0.5, size * 0.78), "EN → УК", font=small, fill="white", anchor="mm")
    img.save(path)


make(512, "pwa/icon-512.png")
make(192, "pwa/icon-192.png")
make(180, "pwa/apple-touch-icon.png")
make(64, "pwa/favicon.png")
