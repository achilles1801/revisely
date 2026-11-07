#!/usr/bin/env python3
"""Activity screenshots beside their mocks (gap audit; activity-redesign/verify/).

The E2E flows 09-activity-light.yaml and 09-activity-dark.yaml take each Activity screen with
takeScreenshot (subflows/activity-screens.yaml). CI keeps those as artifacts of the run
(e2e-<platform>-screens-…). This script:
  1. downloads a run's artifacts with `gh run download` (or reads a folder you already have);
  2. pairs each 09-* capture with its mock in the mocks' png folder;
  3. writes one board per screen: the capture on the left, the mock on the right, the same height,
     with the screen's name, into the verify folder.

  scripts/verify/activity-boards.py --run <run-id> [--platform ios|android]
  scripts/verify/activity-boards.py --artifacts <folder>

Needs Pillow (the mocks' venv has it: ~/Documents/revisely-today-mocks/.venv).
"""
import argparse
import glob
import os
import subprocess
import sys
import tempfile

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow is needed: run this with ~/Documents/revisely-today-mocks/.venv/bin/python")

REPO = "achilles1801/revisely"
MOCKS = os.path.expanduser("~/Documents/revisely-today-mocks/activity-redesign/png")
VERIFY = os.path.expanduser("~/Documents/revisely-today-mocks/activity-redesign/verify")

# Capture name (without theme) → the mock it is compared with (gap audit: 1-overview, 2-day, 3-insights),
# and which part of it: a mock taller than the screen (d1) is cut to the screen's height, its top for
# the first capture and its bottom for the one scrolled to the end.
MOCK_FOR = {
    "09-overview-month": ("d3-calendar", None),
    "09-overview-week": (None, None),  # the mocks show the month only
    "09-day": ("d1-day-full", "top"),
    "09-day-end": ("d1-day-full", "bottom"),
    "09-day-sunday": ("d2-day-light", None),
    "09-menu-revised": ("d10a-long-press", None),
    "09-add-menu": ("d5-add-menu", None),
    "09-insights": ("d4-insights", "top"),
    "09-insights-end": ("d4-insights", "bottom"),
}
MARGIN = 24
TITLE_H = 44


def download(run, platform, into):
    args = ["gh", "run", "download", str(run), "--repo", REPO, "--dir", into]
    if platform:
        args += ["--pattern", f"e2e-{platform}-screens-*"]
    else:
        args += ["--pattern", "e2e-*-screens-*"]
    subprocess.run(args, check=True)


def fit(img, height):
    w = round(img.width * height / img.height)
    return img.resize((w, height), Image.LANCZOS)


def board(capture_path, mock_path, title, out_path, part=None):
    cap = Image.open(capture_path).convert("RGB")
    height = 900
    left = fit(cap, height)
    if mock_path and os.path.exists(mock_path):
        mock = Image.open(mock_path).convert("RGB")
        # A tall mock, cut to the capture's shape (same width, so the same scale).
        tall = round(mock.width * cap.height / cap.width)
        if part and mock.height > tall:
            mock = mock.crop((0, 0, mock.width, tall) if part == "top" else (0, mock.height - tall, mock.width, mock.height))
        right = fit(mock, height)
    else:
        right = Image.new("RGB", (left.width, height), (240, 240, 240))
        ImageDraw.Draw(right).text((24, 24), "No mock for this screen", fill=(60, 60, 60))
    width = left.width + right.width + 3 * MARGIN
    canvas = Image.new("RGB", (width, height + TITLE_H + 2 * MARGIN), (250, 250, 250))
    draw = ImageDraw.Draw(canvas)
    draw.text((MARGIN, MARGIN), f"{title}   ·   left: CI capture   ·   right: mock", fill=(20, 20, 20))
    canvas.paste(left, (MARGIN, TITLE_H + MARGIN))
    canvas.paste(right, (2 * MARGIN + left.width, TITLE_H + MARGIN))
    canvas.save(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", help="a workflow run id (E2E) to download the artifacts of")
    ap.add_argument("--platform", choices=["ios", "android"], help="only this platform's artifacts")
    ap.add_argument("--artifacts", help="a folder that already holds the artifacts")
    ap.add_argument("--out", default=VERIFY)
    args = ap.parse_args()

    folder = args.artifacts
    if args.run:
        folder = tempfile.mkdtemp(prefix="activity-run-")
        download(args.run, args.platform, folder)
    if not folder:
        ap.error("give --run or --artifacts")

    captures = sorted(glob.glob(os.path.join(folder, "**", "09-*-*.png"), recursive=True))
    if not captures:
        sys.exit(f"no 09-* captures under {folder}")
    os.makedirs(args.out, exist_ok=True)
    for path in captures:
        name = os.path.splitext(os.path.basename(path))[0]
        for theme in ("light", "dark"):
            if not name.endswith("-" + theme):
                continue
            screen = name[: -len(theme) - 1]
            mock, part = MOCK_FOR.get(screen, (None, None))
            mock_path = os.path.join(MOCKS, f"{mock}-{theme}.png") if mock else None
            out = os.path.join(args.out, f"{screen}-{theme}-board.png")
            board(path, mock_path, f"{screen} ({theme})", out, part)
            print(out)


if __name__ == "__main__":
    main()
