#!/bin/bash
# The phone's pack readers (Swift and Java) against parts sealed by the server's format code. On a Mac; no simulator.
#   scripts/recite-pack-check/run.sh [OUT] ["core:name=path,..." ...]    real parts are optional
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE/../..
OUT=${1:-$(mktemp -d)}
[ $# -gt 0 ] && shift
[ -f "$ROOT/functions/lib/recitePack/format.js" ] || (cd "$ROOT/functions" && npx tsc)
node "$ROOT/functions/scripts/recite-pack-vectors.js" "$OUT/vectors" "$@"
M=$ROOT/modules-dev/recite-engine
mkdir -p "$OUT/swift" "$OUT/java"
cp "$HERE/main.swift" "$OUT/swift/main.swift"
nice -n 10 swiftc -O -o "$OUT/swift/check" "$OUT/swift/main.swift" "$M/ios/RecitePackReader.swift" "$M/ios/RecitePackKey.swift"
"$OUT/swift/check" "$OUT/vectors"
JAVAC=${JAVAC:-javac}; JAVA=${JAVA:-java}
nice -n 10 "$JAVAC" -d "$OUT/java" "$M/android/src/main/java/app/revisely/reciteengine/RecitePackReader.java" "$HERE/Check.java"
nice -n 10 "$JAVA" -cp "$OUT/java" Check "$OUT/vectors"
