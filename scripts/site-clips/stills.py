"""Make the website's still screens, and its share image, from the App Store screenshots.

    python3 scripts/site-clips/stills.py

Reads store/screenshots/ (the approved 6.9" set, 1320x2868) and writes:
- docs/assets/img/screens/<name>.webp and .jpg, at half size, with the Dynamic Island drawn in
  where the clips have it, so a still sits in the page's phone frame like a clip does;
- docs/assets/img/og.png: the 1200x630 link preview, with the Home screenshot put into the phone
  that's already drawn there (the rest of the image is kept as it is).
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, 'store', 'screenshots')
OUT = os.path.join(ROOT, 'docs', 'assets', 'img', 'screens')
OG = os.path.join(ROOT, 'docs', 'assets', 'img', 'og.png')

STILLS = {'home': '01-home.png', 'revision': '03-revision.png'}

# The island, in the 1320-wide screenshot's pixels (measured on the clips' frames).
ISLAND = {'width': 374, 'height': 110, 'top': 42}

# The phone's screen inside og.png (measured): left, top, width, corner radius.
OG_SCREEN = {'left': 792, 'top': 132, 'width': 306, 'radius': 44}


def with_island(shot):
    im = shot.convert('RGB')
    w = im.width
    scale = 4  # draw large and shrink, for smooth edges
    iw, ih = ISLAND['width'] * scale, ISLAND['height'] * scale
    pill = Image.new('L', (iw, ih), 0)
    ImageDraw.Draw(pill).rounded_rectangle((0, 0, iw - 1, ih - 1), radius=ih // 2, fill=255)
    pill = pill.resize((ISLAND['width'], ISLAND['height']), Image.LANCZOS)
    im.paste((0, 0, 0), ((w - ISLAND['width']) // 2, ISLAND['top']), pill)
    return im


def write_stills():
    os.makedirs(OUT, exist_ok=True)
    for name, file in STILLS.items():
        im = with_island(Image.open(os.path.join(SHOTS, file)))
        half = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
        half.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=82, method=6)
        half.save(os.path.join(OUT, f'{name}.jpg'), 'JPEG', quality=84, optimize=True, progressive=True)
        print(name, {ext: os.path.getsize(os.path.join(OUT, f'{name}.{ext}')) // 1024 for ext in ('webp', 'jpg')})


def write_og():
    og = Image.open(OG).convert('RGB')
    s = OG_SCREEN
    home = with_island(Image.open(os.path.join(SHOTS, STILLS['home'])))
    h = round(home.height * s['width'] / home.width)
    screen = home.resize((s['width'], h), Image.LANCZOS)
    visible = og.height - s['top']
    screen = screen.crop((0, 0, s['width'], visible))
    # The screen's rounded top corners (the bottom runs off the image).
    scale = 4
    mask = Image.new('L', (s['width'] * scale, (visible + s['radius']) * scale), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, s['width'] * scale - 1, (visible + s['radius']) * scale - 1), radius=s['radius'] * scale, fill=255
    )
    mask = mask.resize((s['width'], visible + s['radius']), Image.LANCZOS).crop((0, 0, s['width'], visible))
    og.paste(screen, (s['left'], s['top']), mask)
    og.save(OG, 'PNG', optimize=True)
    print('og.png', os.path.getsize(OG) // 1024, 'KB')


if __name__ == '__main__':
    write_stills()
    write_og()
