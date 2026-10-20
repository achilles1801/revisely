#!/bin/bash
# Build the speech recognition model for recitation checking (src/lib/recite/speechModel.ts):
# Tarteel's Whisper fine-tuned on Qur'an recitation (huggingface.co/tarteel-ai/whisper-base-ar-quran,
# Apache-2.0), converted to whisper.cpp's ggml format and quantised to q5_1.
#
#   scripts/convert-speech-model.sh <work-dir>
#
# Writes <work-dir>/ggml-tarteel-whisper-base-q5_1.bin (59,707,625 bytes, sha256 acc1f03c…6536).
# Upload it to the Storage bucket as models/<file name> (public, like mushaf/), and give a new model
# a new file name: the app keeps whatever it downloaded under the old one.
#
# Needs python3 (3.10+), git and curl. Everything else goes in <work-dir>: a venv (torch,
# transformers, cmake), whisper.cpp v1.9.3 (the version whisper.rn 0.7.4 bundles) and openai/whisper
# (for mel_filters.npz).
#
# The one trap: convert-h5-to-ggml.py takes config.json's max_length as the decoder context. Tarteel's
# config has max_length 1024 (a generation setting) while the decoder has 448 positions, and
# whisper.cpp then refuses the file ("tensor 'decoder.positional_embedding' has wrong size"). The
# config is staged with max_length = max_target_positions.
set -euo pipefail

W="$(cd "${1:?usage: $0 <work-dir>}" && pwd)"
REVISION=5c3c53fdf9272c4f6ee0bee09a1e5a4a615ee25c # tarteel-ai/whisper-base-ar-quran
HF="https://huggingface.co/tarteel-ai/whisper-base-ar-quran/resolve/$REVISION"
PYTHON="${PYTHON:-python3}"

[ -d "$W/venv" ] || { "$PYTHON" -m venv "$W/venv" && "$W/venv/bin/pip" install -q cmake numpy torch transformers; }
[ -d "$W/whisper.cpp" ] || git clone -q --depth 1 --branch v1.9.3 https://github.com/ggml-org/whisper.cpp "$W/whisper.cpp"
[ -d "$W/whisper" ] || git clone -q --depth 1 https://github.com/openai/whisper "$W/whisper"

mkdir -p "$W/hf" "$W/stage" "$W/tmp"
for f in config.json vocab.json added_tokens.json merges.txt normalizer.json preprocessor_config.json \
  special_tokens_map.json tokenizer_config.json pytorch_model.bin; do
  [ -f "$W/hf/$f" ] || curl -sSfL -o "$W/hf/$f" "$HF/$f"
done

for f in "$W"/hf/*; do [ "$(basename "$f")" = config.json ] || ln -sf "$f" "$W/stage/"; done
"$W/venv/bin/python" -I -c '
import json, sys
c = json.load(open(sys.argv[1], encoding="utf8"))
assert c["vocab_size"] == 51865, c["vocab_size"]  # multilingual vocabulary
c["max_length"] = c["max_target_positions"]  # 448: the decoder context
json.dump(c, open(sys.argv[2], "w", encoding="utf8"), indent=2)
' "$W/hf/config.json" "$W/stage/config.json"

(cd "$W/whisper.cpp" && "$W/venv/bin/cmake" -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF >/dev/null && "$W/venv/bin/cmake" --build build -j 8 --target whisper-quantize >/dev/null)

(cd "$W/tmp" && "$W/venv/bin/python" "$W/whisper.cpp/models/convert-h5-to-ggml.py" "$W/stage" "$W/whisper" "$W/tmp")
"$W/whisper.cpp/build/bin/whisper-quantize" "$W/tmp/ggml-model.bin" "$W/ggml-tarteel-whisper-base-q5_1.bin" q5_1 >/dev/null
ls -l "$W/ggml-tarteel-whisper-base-q5_1.bin"
shasum -a 256 "$W/ggml-tarteel-whisper-base-q5_1.bin"
