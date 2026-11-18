"""Make the phone screens for the home's Recite section (mistake detection; dev.revisely.app until the release).

    python3 scripts/site-clips/recite.py --light <screens dir> --dark <screens dir>

Each dir holds E2E flow 18-recite-live's screenshots (`gh run download <run> -p 'e2e-ios-screens-*'`, then
ios/18-recite-live/run/<time>/18-recite-live/takeScreenshot): --light a normal run's, --dark a run of the same flow
with the phone in dark from the start. They are Revisely Dev's real screens (an E2E build: An-Naml 23–24 with a
wrong word and a haraka slip, recorded in src/lib/e2e/reciteLive.ts), on an iPhone 17 Pro (1206x2622).

Writes docs/assets/img/recite/<name>-<light|dark>.webp at 600x1304, the slideshow's size. Two things are cleaned:
- the status bar: the test clock's time and the simulator's empty signal become the slideshow's 9:41 bar, taken from
  its own screens (activity-light, search-dark), so every phone on the page reads the same;
- the E2E build's clock line at the very bottom ("e2e 2026-11-14 10:03 America/Chicago") is painted out.
Nothing else is changed.
"""
import argparse
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SLIDES = os.path.join(ROOT, 'docs', 'assets', 'img', 'slides')
OUT = os.path.join(ROOT, 'docs', 'assets', 'img', 'recite')
SIZE = (600, 1304)

# name: the screenshot (the same name in both runs)
SCREENS = {
    'follow': 'rl03-following',  # Recite: the band on the line being recited
    'marks': 'rl04b-card',  # Mark mistakes: the marks, and a mark's card (Expected, As heard)
    'again': 'rm02-past-card',  # Recite's memory: a remembered mistake's card, after the take
    'test': 'rl08c-test-me-clean',  # Test me: a place continued cleanly on the hidden page
}

# The status bar (rows 0..BAR at 600 wide; the screens' own glyphs sit at 38-58, their header starts at 106) and the
# E2E clock line (rows LINE..end; the control bar ends well above it).
BAR = 72
LINE = 1282
# The slideshow screens whose 9:41 bar is used, on a plain ground.
BAR_FROM = {'light': 'activity-light.webp', 'dark': 'search-dark.webp'}


def clean(src, scheme):
    im = Image.open(src).convert('RGB')
    if im.size != SIZE:
        im = im.resize(SIZE, Image.LANCZOS)
    ground = (255, 255, 255) if scheme == 'light' else (0, 0, 0)
    for y in (90, SIZE[1] - 1):
        if im.getpixel((5, y)) != ground:
            raise SystemExit(f'{src}: expected a {scheme} ground at row {y}, found {im.getpixel((5, y))}')
    bar = Image.open(os.path.join(SLIDES, BAR_FROM[scheme])).convert('RGB').crop((0, 0, SIZE[0], BAR))
    # The slideshow's WebP ground is a level or two off pure white or black: make it the screen's own.
    bar = bar.point(lambda v: 255 if v >= 248 else v) if scheme == 'light' else bar.point(lambda v: 0 if v <= 6 else v)
    im.paste(bar, (0, 0))
    im.paste(ground, (0, LINE, SIZE[0], SIZE[1]))
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--light', required=True)
    ap.add_argument('--dark', required=True)
    ap.add_argument('--quality', type=int, default=82)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name, shot in SCREENS.items():
        for scheme, folder in (('light', a.light), ('dark', a.dark)):
            path = os.path.join(OUT, f'{name}-{scheme}.webp')
            clean(os.path.join(os.path.expanduser(folder), f'{shot}.png'), scheme).save(path, 'WEBP', quality=a.quality, method=6)
            total += os.path.getsize(path)
            print(f'{name}-{scheme}: {os.path.getsize(path) // 1024} KB')
    print(f'total {total // 1024} KB')


if __name__ == '__main__':
    main()
