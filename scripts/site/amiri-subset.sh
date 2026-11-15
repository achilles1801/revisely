#!/bin/bash
# The website's Arabic fonts (docs/assets/fonts/Amiri-Regular.woff2 and Amiri-Bold.woff2): Amiri 1.003, the app's
# font, cut down to what the pages write and saved as WOFF2. About 100 KB each, against 211 KB gzipped for the whole
# Regular TTF the pages loaded before; and Arabic headings get a real bold instead of one the browser smears.
#
#   python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools brotli
#   gh release download 1.003 --repo aliftype/amiri --pattern 'Amiri-1.003.zip' && unzip Amiri-1.003.zip
#   PATH=/tmp/fontvenv/bin:$PATH scripts/site/amiri-subset.sh Amiri-1.003
#
# Kept: Basic Latin and Latin-1 (Latin words on Arabic pages), all of the Arabic block (letters, marks, Arabic-Indic
# digits, the Arabic comma the dates use), general punctuation (quotes, dashes, the isolates around app labels), the
# ornate parentheses ﴾ ﴿ and the dotted circle shapers draw for a stray mark. Every layout feature stays, so the
# text shapes exactly as with the whole font (checked: every Arabic string drawn with both, pixel for pixel).
# worker/__tests__/siteArabic.test.ts reads UNICODES below and fails when the pages write a character outside it:
# widen it here, run this again, and commit the fonts.
# Amiri's licence (SIL OFL 1.1, docs/assets/fonts/Amiri-OFL.txt) names no Reserved Font Name, so the subset keeps
# the name; its copyright and licence records are kept too.
set -euo pipefail
UNICODES="U+0000-00FF,U+0600-06FF,U+2000-206F,U+FD3E-FD3F,U+25CC"
SRC=${1:?usage: scripts/site/amiri-subset.sh <folder with Amiri 1.003 Amiri-Regular.ttf and Amiri-Bold.ttf>}
OUT="$(cd "$(dirname "$0")/../.." && pwd)/docs/assets/fonts"
for w in Regular Bold; do
  pyftsubset "$SRC/Amiri-$w.ttf" --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 --no-hinting \
    --name-IDs='*' --name-languages='*' --output-file="$OUT/Amiri-$w.woff2"
  echo "$OUT/Amiri-$w.woff2 $(($(wc -c < "$OUT/Amiri-$w.woff2") / 1024)) KB"
done
