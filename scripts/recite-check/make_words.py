#!/usr/bin/env python3
"""The checker's words for the whole Quran, worked out once (lab/words.bin in the image).

checker.Key.passage works out each word's sounds (the phonetizer, four ways of saying it) and its look-alikes (an
edit-distance search of the lexicon): about 25 ms a word on a Mac and 100 ms on Cloud Run, in pure Python. A cold
instance paid that for every word a check or a live segment needed (4 s before the first live hop on a new passage,
5 s of a check of Al-Fatiha). With the table, an Engine reads words instead. Same output: Key.passage with the
service's look-alike settings. The table carries engine.words_key() (a hash of the checker's and the word list's
code, the lexicon and the phonetizer's version), and Engine ignores a table made under another key, so a new
checker that changes none of those keeps its table.

  python make_words.py --part I/N [--gcs]      one slice (a Cloud Run job task; I/N default to its index and count)
  python make_words.py --merge OUT PART...     the slices into one table

The job (README.md, "The word table") runs it on the service's own image and writes the slices to the dev bucket
under recite-cache/<key>/, where no client can reach them; stage.sh merges them into the image.
"""
import argparse
import os
import pathlib
import pickle
import sys
import time

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent


def part(i, n, gcs):
    from engine import WORDS_P, Engine, words_key  # noqa: E402  (the harness)
    import checker
    import live
    key = checker.Key(live._VocabEar())
    wk = words_key()
    words = Engine.word_count(key)
    lo, hi = words * i // n, words * (i + 1) // n
    t0 = time.time()
    blobs = []
    for w in range(lo, hi):
        blobs.append(pickle.dumps(key.passage(w, w + 1, int(WORDS_P['alts']), WORDS_P['alt_rule'])[0], protocol=5))
        if (w - lo) % 1000 == 999:
            print(f'part {i}/{n}: {w - lo + 1}/{hi - lo} words, {time.time() - t0:.0f} s', flush=True)
    out = {'key': wk, 'alts': int(WORDS_P['alts']), 'rule': WORDS_P['alt_rule'], 'lo': lo, 'hi': hi,
           'blobs': blobs}
    data = pickle.dumps(out, protocol=5)
    name = f'words-{i:02d}-of-{n:02d}.pkl'
    if gcs:
        import store
        store.put(f'recite-cache/{wk}/{name}', data, 'application/octet-stream')
        print(f'part {i}/{n}: words {lo}-{hi} in {time.time() - t0:.0f} s -> recite-cache/{wk}/{name}')
    else:
        pathlib.Path(name).write_bytes(data)
        print(f'part {i}/{n}: words {lo}-{hi} in {time.time() - t0:.0f} s -> {name}')


def merge(out, parts):
    ps = sorted((pickle.loads(pathlib.Path(p).read_bytes()) for p in parts), key=lambda p: p['lo'])
    meta = {k: ps[0][k] for k in ('key', 'alts', 'rule')}
    if any({k: p[k] for k in meta} != meta for p in ps):
        sys.exit('the parts were made by different checkers')
    if ps[0]['lo'] != 0 or any(a['hi'] != b['lo'] for a, b in zip(ps, ps[1:])):
        sys.exit('the parts leave words out')
    blobs = [b for p in ps for b in p['blobs']]
    offsets = np.zeros(len(blobs) + 1, np.int64)
    offsets[1:] = np.cumsum([len(b) for b in blobs])
    table = dict(meta, words=len(blobs), offsets=offsets, blob=b''.join(blobs))
    pathlib.Path(out).write_bytes(pickle.dumps(table, protocol=5))
    print(f'{len(blobs)} words, {offsets[-1] / 1e6:.0f} MB -> {out} (words key {meta["key"]})')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--part', default=f"{os.environ.get('CLOUD_RUN_TASK_INDEX', 0)}/"
                                      f"{os.environ.get('CLOUD_RUN_TASK_COUNT', 1)}")
    ap.add_argument('--gcs', action='store_true')
    ap.add_argument('--merge', nargs='+', metavar=('OUT', 'PART'))
    a = ap.parse_args()
    if a.merge:
        merge(a.merge[0], a.merge[1:])
    else:
        i, n = (int(x) for x in a.part.split('/'))
        part(i, n, a.gcs)


if __name__ == '__main__':
    main()
