"""Make the website's share image from the App Store Home screenshot.

    python3 scripts/site-clips/stills.py

Reads store/screenshots/01-home.png (the approved 6.9" set, 1320x2868) and writes
docs/assets/img/og.png: the 1200x630 link preview, with the Home screenshot (and the Dynamic Island
drawn in) put into the phone that's already drawn there. The rest of the image is kept as it is.
The slideshow's screens come from slides.py.
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, 'store', 'screenshots')
OG = os.path.join(ROOT, 'docs', 'assets', 'img', 'og.png')

HOME = '01-home.png'

# The island, in the 1320-wide screenshot's pixels.
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


def write_og():
    og = Image.open(OG).convert('RGB')
    s = OG_SCREEN
    home = with_island(Image.open(os.path.join(SHOTS, HOME)))
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
    write_og()
