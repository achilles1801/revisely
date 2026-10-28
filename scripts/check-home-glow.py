#!/usr/bin/env python3
"""Check a screenshot of Home for a hard edge in its accent glow.

The glow at the top of Home must fade into the ground: no row where the tint
stops in a line across the screen (it read as a box twice: an opaque
pull-to-refresh area, Oct 27, and a hairline under a glow that had faded just
above it, Oct 28). This walks down columns near both edges of the screen, away
from the centred title, the icons and the content's text, and reports, where
the glow is, any step in colour (the tint stops) or any line drawn across it,
larger than the gradient's own change (a few units per 6 px), in the top half
of the screen. Lines on plain ground (row separators) are fine.

  pip install pillow
  python3 scripts/check-home-glow.py home.png [more.png ...]

Take the screenshots in light mode, at rest and mid-pull, with each accent.
Exits 1 if any has an edge.
"""
import sys

from PIL import Image

STEP = 3  # pixels between samples
LIMIT = 12  # largest change in summed RGB between samples that still counts as smooth


def tinted(c):
    """Glow, not plain ground: off-white with some colour in it."""
    return min(c) < 253 and max(c) - min(c) > 2


def edges(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    gap = 6  # px either side of a sample: past a hairline, still inside a smooth fade
    found = []
    # Columns in the side margins: Home's text starts at the 16pt gutter and the
    # rows' ⋯ end at the right one, so 2–3% in from each side is ground only.
    for x in (int(w * 0.025), int(w * 0.975)):
        diff = lambda a, b: sum(abs(i - j) for i, j in zip(a, b))
        for y in range(2 * gap, h // 2 - gap, STEP):
            higher, above, here, below = (im.getpixel((x, y + d)) for d in (-2 * gap, -gap, 0, gap))
            # Only inside the glow: tinted above, and steadily so (not a sample
            # that happens to fall on a separator between rows).
            if not tinted(above) or diff(higher, above) > LIMIT:
                continue
            # A step: the tint stops (a box's edge, an opaque layer below it).
            step = diff(above, below) > LIMIT * 2
            # A line drawn across the glow (a hairline under the header).
            line = diff(here, above) > LIMIT and diff(here, below) > LIMIT
            if step or line:
                found.append((x, y, above, here, below))
    return found


if __name__ == "__main__":
    bad = False
    for path in sys.argv[1:]:
        e = edges(path)
        if e:
            bad = True
            x, y, a, m, b = e[0]
            print(f"{path}: {len(e)} edge(s); first at x {x}, y {y}: {a} / {m} / {b}")
        else:
            print(f"{path}: smooth")
    sys.exit(1 if bad else 0)
