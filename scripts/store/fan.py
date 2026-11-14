"""Store slides with several screens: a fan of cards (the accents) and screens side by side (light and dark).

    python3 scripts/store/fan.py fan  <out.png> <headline> <sub> <theme> <left.png> <middle.png> <right.png>
    python3 scripts/store/fan.py fan-play <out.png> <headline> <theme> <left.png> <middle.png> <right.png>   # 1080×1920
    python3 scripts/store/fan.py pair <out.png> <headline> <sub> <theme> <left.png> <right.png>
    python3 scripts/store/fan.py split <out.png> <light.png> <dark.png>    # one screen, light top-left, dark bottom-right

Same canvas, colours and headline as compose.py; every card is a real capture with the phone's corners.
"""
import math
import sys

from PIL import Image, ImageDraw, ImageFilter

from compose import THEMES, font, glow, wrap

W, H = 1320, 2868


def card(src, width, theme):
    """A screen as a card: rounded corners, a hairline rim, on transparent ground (RGBA)."""
    t = THEMES[theme]
    im = (src if isinstance(src, Image.Image) else Image.open(src)).convert('RGB')
    h = int(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    r = int(width * 0.125)
    rim = 4
    out = Image.new('RGBA', (width + 2 * rim, h + 2 * rim), (0, 0, 0, 0))
    ImageDraw.Draw(out).rounded_rectangle((0, 0, out.width - 1, out.height - 1), r + rim, fill=(*t['outline'], 255))
    mask = Image.new('L', (width, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, h - 1), r, fill=255)
    out.paste(im, (rim, rim), mask)
    return out


def place(canvas, c, cx, cy, angle, shadow):
    """Pastes card `c` centred at (cx, cy), turned `angle` degrees (clockwise positive), with a soft shadow."""
    rot = c.rotate(-angle, resample=Image.BICUBIC, expand=True)
    x, y = int(cx - rot.width / 2), int(cy - rot.height / 2)
    if shadow:
        a = rot.getchannel('A').point(lambda v: int(v * shadow))
        sh = Image.new('RGBA', rot.size, (0x14, 0x10, 0x3C, 0))
        sh.putalpha(a)
        layer = Image.new('RGBA', canvas.size)
        layer.alpha_composite(sh, (max(0, x), max(0, y + 24)) if x >= 0 and y >= 0 else (0, 0))
        if x < 0 or y < 0:
            layer = Image.new('RGBA', canvas.size)
            big = Image.new('RGBA', (canvas.width + 2 * rot.width, canvas.height + 2 * rot.height))
            big.alpha_composite(sh, (x + rot.width, y + 24 + rot.height))
            layer = big.crop((rot.width, rot.height, rot.width + canvas.width, rot.height + canvas.height))
        canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(40)))
    big = Image.new('RGBA', (canvas.width + 2 * rot.width, canvas.height + 2 * rot.height))
    big.alpha_composite(rot, (x + rot.width, y + rot.height))
    canvas.alpha_composite(big.crop((rot.width, rot.height, rot.width + canvas.width, rot.height + canvas.height)))


def base(headline, sub, theme, size=(W, H), hsize=None, top=None):
    """The ground, glow and headline. App Store size by default; Play's 1080×1920 scales the type to its width."""
    t = THEMES[theme]
    w, h = size
    k = w / W
    canvas = Image.new('RGBA', size, (*t['bg'], 255))
    glow(canvas, theme, int(1250 * h / H))
    d = ImageDraw.Draw(canvas)
    hf, sf = font(hsize or int(104 * k), 700, 96), font(int(50 * k), 400, 28)
    y = top if top is not None else int(190 * h / H)
    for line in wrap(d, headline, hf, w - int(150 * k)):
        d.text((w / 2, y), line, font=hf, fill=t['text'], anchor='ma')
        y += int(hf.size * 1.12)
    y += int(24 * k)
    for line in wrap(d, sub or '', sf, w - int(190 * k)):
        d.text((w / 2, y), line, font=sf, fill=t['secondary'], anchor='ma')
        y += int(sf.size * 1.3)
    return canvas, y


def fan(out, headline, sub, theme, srcs, width=680, spread=15, radius=1550, pivot_y=3120, size=(W, H), hsize=None, top=None):
    canvas, _ = base(headline, sub, theme, size, hsize, top)
    w = size[0]
    shadow = 0.22 if theme == 'light' else 0.0
    n = len(srcs)
    angles = [spread * (i - (n - 1) / 2) for i in range(n)]
    order = sorted(range(n), key=lambda i: -abs(angles[i]))  # the outer cards first, the middle on top
    for i in order:
        a = math.radians(angles[i])
        cx, cy = w / 2 + radius * math.sin(a), pivot_y - radius * math.cos(a)
        place(canvas, card(srcs[i], width, theme), cx, cy, angles[i], shadow)
    canvas.convert('RGB').save(out, optimize=True)


def pair(out, headline, sub, theme, srcs, width=590, tilt=5, gap=-60):
    canvas, y = base(headline, sub, theme)
    shadow = 0.22 if theme == 'light' else 0.0
    cy = 1560
    for i, src in enumerate(srcs):
        sign = -1 if i == 0 else 1
        cx = W / 2 + sign * (width / 2 + gap / 2)
        place(canvas, card(src, width, theme), cx, cy + 30, sign * tilt, shadow)
    canvas.convert('RGB').save(out, optimize=True)


def split(light, dark):
    """One screen, light above a diagonal and dark below it."""
    a, b = Image.open(light).convert('RGB'), Image.open(dark).convert('RGB')
    w, h = a.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).polygon([(0, h * 0.62), (w, h * 0.38), (w, h), (0, h)], fill=255)
    out = a.copy()
    out.paste(b, (0, 0), mask)
    return out


if __name__ == '__main__':
    kind, out, *rest = sys.argv[1:]
    if kind == 'fan':
        headline, sub, theme, *srcs = rest
        fan(out, headline, sub, theme, srcs)
    elif kind == 'fan-play':
        # Google Play's 1080×1920 (no line under the headline, as Play's other slides).
        headline, theme, *srcs = rest
        fan(out, headline, None, theme, srcs, width=500, spread=15, radius=1150, pivot_y=2280, size=(1080, 1920),
            hsize=int(84 * 1080 / W), top=int(108 * 1080 / W))  # as compose.py's Play slides (plan-play.json)
    elif kind == 'pair':
        headline, sub, theme, *srcs = rest
        pair(out, headline, sub, theme, srcs)
    elif kind == 'split':
        split(*rest[:2]).save(out)
    print(out)
