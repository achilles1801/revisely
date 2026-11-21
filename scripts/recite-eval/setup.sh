#!/bin/bash
# Lab setup: Python 3.12 venv (via uv), cmake, whisper.cpp v1.9.3 (whisper.rn 0.7.4's version) with Metal.
set -euo pipefail
L=${LAB:-$HOME/revisely-mistake-lab}
mkdir -p "$L/tools" "$L/models" "$L/data" "$L/runs"
cd "$L"
[ -d .boot ] || { /usr/bin/python3 -m venv .boot && .boot/bin/pip install -q --upgrade pip uv; }
UV=.boot/bin/uv
[ -d .venv ] || $UV venv --python 3.12 .venv
$UV pip install --python .venv/bin/python -q cmake numpy scipy soundfile requests pyarrow
[ -d tools/whisper.cpp ] || git clone -q --depth 1 --branch v1.9.3 https://github.com/ggml-org/whisper.cpp tools/whisper.cpp
cd tools/whisper.cpp
../../.venv/bin/cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DGGML_METAL=ON >/dev/null
../../.venv/bin/cmake --build build -j 10 --target whisper-cli whisper-quantize whisper-server whisper-bench >/dev/null
ls build/bin
