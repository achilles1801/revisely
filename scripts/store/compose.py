"""Store screenshots: a headline over the app's own screen, in the app's colours.

    python3 scripts/store/compose.py <plan.json>

Each entry of the plan names a capture, its headline and sub-line, the theme (light or dark) and the
canvas (App Store 6.9": 1320x2868; Google Play phone: 1080x1920). Colours are the app's tokens
(src/theme/v2.ts, Indigo). Output is RGB PNG (no alpha), as both stores ask.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SF = '/System/Library/Fonts/SFNS.ttf'

# src/theme/v2.ts: the light and dark palettes, and Indigo's tokens.
THEMES = {
    'light': {
        'bg': (255, 255, 255), 'text': (0x1A, 0x1A, 0x1A), 'secondary': (0x61, 0x69, 0x77),
        'outline': (0xE5, 0xE7, 0xEB), 'accent': (0x62, 0x4B, 0xD5),
        # lightGlow('#624BD5', 0.32): opacity 0.32 (1 - t)^2.8
        'glow': [((0x62, 0x4B, 0xD5), 0.32)], 'shadow': 0.16,
    },
    'dark': {
        'bg': (0, 0, 0), 'text': (255, 255, 255), 'secondary': (0x8A, 0x8A, 0x93),
        'outline': (0x33, 0x33, 0x33), 'accent': (0x97, 0x89, 0xDA),
        'glow': [((0x2E, 0x0E, 0xC6), 0.45)], 'shadow': 0.0,
    },
}


def font(size, weight=400, opsz=None):
    f = ImageFont.truetype(SF, size)
    f.set_variation_by_axes([100, opsz or min(96, max(17, size / 2)), 400, weight])
    return f


def glow(canvas, theme, height):
    """Home's hero glow (v2/HeroGlow): one full-bleed layer from the top, fading as (1 - t)^2.8."""
    w, _ = canvas.size
    col, top = THEMES[theme]['glow'][0]
    layer = Image.new('RGBA', (w, height))
    px = layer.load()
    for y in range(height):
        a = int(round(255 * top * (1 - y / height) ** 2.8))
        for x in range(w):
            px[x, y] = (*col, a)
    canvas.alpha_composite(layer, (0, 0))


def wrap(draw, text, f, width):
    """Lines no wider than `width`; two lines are balanced, so no word is left on its own."""
    if draw.textlength(text, font=f) <= width:
        return [text]
    words = text.split(' ')
    best = None
    for i in range(1, len(words)):
        a, b = ' '.join(words[:i]), ' '.join(words[i:])
        wa, wb = draw.textlength(a, font=f), draw.textlength(b, font=f)
        if max(wa, wb) <= width and (best is None or abs(wa - wb) < best[0]):
            best = (abs(wa - wb), [a, b])
    if best:
        return best[1]
    lines, cur = [], ''
    for word in words:
        trial = (cur + ' ' + word).strip()
        if draw.textlength(trial, font=f) <= width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    lines.append(cur)
    return lines


def rounded(im, radius):
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius, fill=255)
    out = Image.new('RGBA', im.size)
    out.paste(im, (0, 0), mask)
    return out, mask


def compose(src, headline, sub, theme='light', size=(1320, 2868), out=None, layout=None):
    t = THEMES[theme]
    W, H = size
    L = layout or {}
    s = W / 1320  # every measure below is for the 1320-wide canvas
    canvas = Image.new('RGBA', size, (*t['bg'], 255))
    glow(canvas, theme, int(L.get('glow', 1250) * s))
    d = ImageDraw.Draw(canvas)

    # Headline and sub-line, centred.
    hf = font(int(L.get('headline', 104) * s), 700, 96)
    sf = font(int(L.get('sub', 50) * s), 400, 28)
    y = int(L.get('top', 190) * s)
    for line in wrap(d, headline, hf, W - int(150 * s)):
        d.text((W / 2, y), line, font=hf, fill=t['text'], anchor='ma')
        y += int(hf.size * 1.12)
    y += int(24 * s)
    if sub:
        for line in wrap(d, sub, sf, W - int(190 * s)):
            d.text((W / 2, y), line, font=sf, fill=t['secondary'], anchor='ma')
            y += int(sf.size * 1.3)

    # The app's screen, its corners as the phone's, a hairline round it.
    shot = Image.open(src).convert('RGB')
    if L.get('cleanBar'):
        # Play asks for no notification icons in the status bar: paint the area beside the clock with the
        # bar's own ground, row by row, from a column just right of it ([x1, y1, x2, y2, sampleX], capture pixels).
        x1, y1, x2, y2, sx = L['cleanBar']
        px = shot.load()
        for yy in range(y1, y2):
            c = px[sx, yy]
            for xx in range(x1, x2):
                px[xx, yy] = c
    sw = int(L.get('screen', 1000) * s)
    sh = int(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    radius = int(sw * 0.125)
    sx = (W - sw) // 2
    sy = int(L.get('screenTop', max(y + 60 * s, 640 * s)))
    if t['shadow']:
        sh_layer = Image.new('RGBA', size, (0, 0, 0, 0))
        ImageDraw.Draw(sh_layer).rounded_rectangle((sx, sy + int(18 * s), sx + sw, sy + sh + int(18 * s)), radius,
                                                   fill=(0x14, 0x10, 0x3C, int(255 * t['shadow'])))
        canvas.alpha_composite(sh_layer.filter(ImageFilter.GaussianBlur(int(46 * s))))
    rim = int(4 * s)
    ImageDraw.Draw(canvas).rounded_rectangle((sx - rim, sy - rim, sx + sw + rim - 1, sy + sh + rim - 1), radius + rim,
                                             fill=(*t['outline'], 255))
    face, mask = rounded(shot, radius)
    canvas.alpha_composite(face, (sx, sy))

    result = canvas.convert('RGB')
    if out:
        os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
        result.save(out, optimize=True)
    return result


if __name__ == '__main__':
    plan = json.load(open(sys.argv[1]))
    base = os.path.dirname(os.path.abspath(sys.argv[1]))
    for e in plan['shots']:
        for theme in e.get('themes', ['light']):
            src = e['src'][theme] if isinstance(e['src'], dict) else e['src']
            out = e['out'][theme] if isinstance(e['out'], dict) else e['out']
            compose(os.path.join(base, src), e['headline'], e.get('sub'), theme, tuple(plan.get('size', (1320, 2868))),
                    os.path.join(base, out), {**plan.get('layout', {}), **e.get('layout', {})})
            print(out)
