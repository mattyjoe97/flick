"""App icons for "Add to Home Screen": the finger flick, loaded, on your oak desk.

Writes public/icon-192.png, icon-512.png, icon-maskable-512.png and
apple-touch-icon.png. Run from the repo root: python3 tools/make-icons.py
"""
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

S = 1024
wood = Image.open('src/assets/art/desk-wood.webp').convert('RGB')
bg = Image.new('RGB', (S, S))
for x in range(0, S, 512):
    for y in range(0, S, 512):
        bg.paste(wood, (x, y))
bg = ImageEnhance.Brightness(bg).enhance(0.82)
# A soft spotlight in the middle so the hand pops.
glow = Image.new('L', (S, S), 0)
ImageDraw.Draw(glow).ellipse((140, 140, S - 140, S - 140), fill=255)
glow = glow.filter(ImageFilter.GaussianBlur(160))
bright = ImageEnhance.Brightness(bg).enhance(1.35)
bg = Image.composite(bright, bg, glow)


def compose(scale: float) -> Image.Image:
    """The hand (with its band) centred; `scale` keeps it inside the maskable safe zone."""
    out = bg.copy().convert('RGBA')
    hand = Image.open('art/source/01_finger_flick_loaded.png').convert('RGBA')
    hand = hand.crop(hand.getbbox())
    w = int(S * 0.9 * scale)
    h = int(hand.height * w / hand.width)
    hand = hand.resize((w, h), Image.LANCZOS)
    # Point the fingertip up and to the left, like it's about to flick.
    hand = hand.rotate(-22, resample=Image.BICUBIC, expand=True)
    shadow = Image.new('RGBA', hand.size, (0, 0, 0, 0))
    shadow.putalpha(hand.split()[3].point(lambda a: int(a * 0.45)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    x = (S - hand.width) // 2 + int(30 * scale)
    y = (S - hand.height) // 2 + int(10 * scale)
    out.alpha_composite(shadow, (x + 14, y + 22))
    out.alpha_composite(hand, (x, y))
    return out.convert('RGB')


full = compose(1.0)
full.resize((512, 512), Image.LANCZOS).save('public/icon-512.png', optimize=True)
full.resize((192, 192), Image.LANCZOS).save('public/icon-192.png', optimize=True)
full.resize((180, 180), Image.LANCZOS).save('public/apple-touch-icon.png', optimize=True)
compose(0.72).resize((512, 512), Image.LANCZOS).save('public/icon-maskable-512.png', optimize=True)
print('icons written')
