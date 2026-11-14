"""Google Play's feature graphic (1024x500, 24-bit PNG): the headline and pieces of the app's own screens
on Indigo. Play's guidance (checked Nov 2026): no pure white, black or dark grey ground, nothing that
repeats the app icon, no "Free"/"New", key content away from the edges, and the play button sits over
the centre when there is a video.

    python3 scripts/store/feature_graphic.py <out.png> <headline> <sub> <card.png>[@x,y,w] ...
"""
import sys

from PIL import Image, ImageDraw, ImageFilter

from compose import font, wrap

W, H = 1024, 500
INDIGO = (0x62, 0x4B, 0xD5)
ELECTRIC = (0x2E, 0x0E, 0xC6)
DEEP = (0x14, 0x10, 0x3C)
LAVENDER = (0x97, 0x89, 0xDA)


def ground():
    im = Image.new('RGB', (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            # Indigo at the left, deepening to the right and down: lit where the words are.
            u = x / W * 0.75 + y / H * 0.25
            c = [int(INDIGO[i] + (DEEP[i] - INDIGO[i]) * (u ** 1.4) * 0.85) for i in range(3)]
            px[x, y] = tuple(c)
    return im


def card(im, src, x, y, w, radius=22):
    c = Image.open(src).convert('RGB')
    h = int(c.height * w / c.width)
    c = c.resize((w, h), Image.LANCZOS)
    sh = Image.new('RGBA', im.size)
    ImageDraw.Draw(sh).rounded_rectangle((x, y + 10, x + w, y + h + 10), radius, fill=(0x14, 0x10, 0x3C, 120))
    base = im.convert('RGBA')
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(16)))
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=255)
    base.paste(c, (x, y), mask)
    return base.convert('RGB')


if __name__ == '__main__':
    out, headline, sub, *cards = sys.argv[1:]
    im = ground()
    for spec in cards:
        src, pos = spec.split('@')
        x, y, w = (int(v) for v in pos.split(','))
        im = card(im, src, x, y, w)
    d = ImageDraw.Draw(im)
    hf, sf = font(50, 700, 96), font(25, 500, 28)
    y = 150
    for line in wrap(d, headline, hf, 380):
        d.text((72, y), line, font=hf, fill=(255, 255, 255))
        y += 58
    y += 14
    for line in wrap(d, sub, sf, 380):
        d.text((72, y), line, font=sf, fill=(0xEF, 0xEC, 0xFB))
        y += 34
    im.save(out, optimize=True)
    print(out, im.size, im.mode)
