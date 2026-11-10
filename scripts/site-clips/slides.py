"""Make the phone screens for revisely.app's slideshow.

    python3 scripts/site-clips/slides.py --captures <dir> --stills <dir> --posters <dir>

Writes docs/assets/img/slides/<name>.webp at 600x1304, the size the loops are. Sources:
- captures: the store previews' 1320x2868 captures (~/Documents/revisely-today-mocks/store-104/captures),
  so the site's Home, accents, Activity and translation picker match the App Store listing;
- stills: simulator screenshots taken for the site (the Prayer sheet, search results, a mushaf page);
- posters: the .jpg that cut.py writes next to each loop. A slide with a loop shows that picture until
  the loop starts, and the loop starts from that same moment (data-t-light / data-t-dark in
  docs/index.html), so nothing jumps.
"""
import argparse
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'docs', 'assets', 'img', 'slides')
SIZE = (600, 1304)

SCREENS = {
    # Slide 1: Home in the three accents, fanned like cards.
    'fan-indigo-light': ('captures', 'home-indigo-light.png'),
    'fan-indigo-dark': ('captures', 'home-indigo-dark.png'),
    'fan-crimson-light': ('captures', 'home-crimson-light.png'),
    'fan-crimson-dark': ('captures', 'home-crimson-dark.png'),
    'fan-jade-light': ('captures', 'home-jade-light.png'),
    'fan-jade-dark': ('captures', 'home-jade-dark.png'),
    'today-light': ('captures', 'home-light.png'),
    'today-dark': ('captures', 'home-dark.png'),
    'recite-light': ('posters', 'recite.jpg'),
    'recite-dark': ('posters', 'session-dark.jpg'),
    'search-light': ('posters', 'search.jpg'),
    'search-dark': ('stills', 'search-dark.png'),
    'translations-light': ('posters', 'translations.jpg'),
    'translations-dark': ('captures', 'picker-favorites-dark.png'),
    'activity-light': ('posters', 'activity.jpg'),
    'activity-dark': ('captures', 'activity-month-dark.png'),
    'prayer-light': ('stills', 'prayer-light.png'),
    'prayer-dark': ('stills', 'prayer-dark.png'),
    'qibla-light': ('stills', 'qibla-light.png'),
    'qibla-dark': ('stills', 'qibla-dark.png'),
    'offline-light': ('stills', 'page-light.png'),
    'offline-dark': ('stills', 'page-dark.png'),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--captures', required=True)
    ap.add_argument('--stills', required=True)
    ap.add_argument('--posters', required=True)
    ap.add_argument('--quality', type=int, default=82)
    a = ap.parse_args()
    dirs = {'captures': a.captures, 'stills': a.stills, 'posters': a.posters}
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name, (kind, file) in SCREENS.items():
        im = Image.open(os.path.join(os.path.expanduser(dirs[kind]), file)).convert('RGB')
        if im.size != SIZE:
            im = im.resize(SIZE, Image.LANCZOS)
        path = os.path.join(OUT, f'{name}.webp')
        im.save(path, 'WEBP', quality=a.quality, method=6)
        total += os.path.getsize(path)
        print(f'{name}: {os.path.getsize(path) // 1024} KB')
    print(f'total {total // 1024} KB')


if __name__ == '__main__':
    main()
