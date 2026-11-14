#!/usr/bin/env python3
"""A slice of Tadabur (FaisaI/tadabur on Hugging Face: 1400+ h, 600+ reciters, one ayah per file) for training.

Every source and its published licence is listed in the lab's data/SOURCES.md (not in this repository). The rows of
its 385 parquet files are shuffled, so a few files are a spread of its reciters. Each file (about 2.4 GB, 1000 ayat)
is downloaded, cut to 16 kHz int16, the test reciters dropped (bench-v0's eight: Abdul Basit, Minshawi, Shuraym,
Sudais, Husary, Alafasy, Hani ar-Rifai), and deleted.

  python tadabur_fetch.py 1 2 3 ...     -> data/tadabur/t00001.audio.npy + .rows.pkl
"""
import io
import json
import os
import pathlib
import pickle
import subprocess
import sys

import numpy as np

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
OUT = LAB / 'data/tadabur'
URL = 'https://huggingface.co/datasets/FaisaI/tadabur/resolve/main/data/train-{:05d}.parquet'
TEST_RECITERS = {0, 1, 8, 15, 33, 63, 528}  # sheikh_dict.json ids of bench-v0's reciters


def fetch(i):
    import pyarrow.parquet as pq
    import soundfile as sf
    from scipy.signal import resample_poly
    OUT.mkdir(parents=True, exist_ok=True)
    name = f't{i:05d}'
    if (OUT / f'{name}.rows.pkl').exists():
        return name, 'done before'
    tmp = OUT / f'{name}.parquet.part'
    # HTTP/1.1, resumed and retried: with 40 downloads at once Hugging Face reset HTTP/2 streams (curl 92) on 7 of
    # the first 17 files (Nov 11 2026)
    for k in range(4):
        r = subprocess.run(['curl', '-sSL', '--http1.1', '--retry', '5', '--retry-all-errors', '-C', '-', '-o', str(tmp),
                            URL.format(i)])
        if r.returncode == 0:
            break
        import time
        time.sleep(10 * (k + 1))
    else:
        raise RuntimeError(f'{name}: download failed (curl {r.returncode})')
    pf = pq.ParquetFile(tmp)
    chunks, rows, off = [], [], 0
    for b in pf.iter_batches(batch_size=50):
        for r in b.to_pylist():
            if r['reciter_id'] in TEST_RECITERS:
                continue
            try:
                x, sr = sf.read(io.BytesIO(r['audio']['bytes']), dtype='float32')
            except Exception:
                continue
            if x.ndim > 1:
                x = x.mean(1)
            if sr != 16000:
                from math import gcd
                g = gcd(int(sr), 16000)
                x = resample_poly(x, 16000 // g, int(sr) // g).astype(np.float32)
            if len(x) < 8000 or len(x) > 16000 * 30:
                continue
            a = np.clip(x * 32768, -32768, 32767).astype(np.int16)
            chunks.append(a)
            meta = json.loads(r['metadata']) if r.get('metadata') else {}
            rows.append({'off': off, 'n': len(a), 'reciter': r['reciter_id'], 'sura': r['surah_id'], 'ayah': r['ayah_id'],
                         'uthmani': r['text_ar_uthmani'], 'words': meta.get('word_alignments'),
                         'file': meta.get('audio_filename')})
            off += len(a)
    np.save(OUT / f'{name}.audio.npy', np.concatenate(chunks) if chunks else np.zeros(0, np.int16))
    pickle.dump(rows, open(OUT / f'{name}.rows.pkl', 'wb'))
    tmp.unlink()
    return name, f'{len(rows)} ayat, {off / 16000 / 3600:.2f} h'


if __name__ == '__main__':
    import multiprocessing as mp
    idx = [int(a) for a in sys.argv[1:]]
    with mp.get_context('spawn').Pool(int(os.environ.get('JOBS', 3))) as pool:
        for name, msg in pool.imap_unordered(fetch, idx):
            print(name, msg, flush=True)
