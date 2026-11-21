#!/usr/bin/env python3
"""Ayah endings swapped: bench-v0's passages with an ayah's last word said as another ayah's last word (Majd: memorizers
most often forget which word ends an ayah). Same reciter, same passage, an ayah up to 10 away whose ending is another
word; from audio bench.py has already cached (nothing is fetched). Events: `end` with `into` (the ayah whose ending was
said) and `from` (that word's place in its ayah), as `mut`.

  python bench_endings.py [--out DIR] [--per 3]
"""
import argparse
import hashlib
import json
import pathlib
import random
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import bench  # noqa: E402
from bench import SR, Audio, Chunk, Words, ayah_chunks, floor_noise, join, normalize, silence  # noqa: E402

NEAR = 10


def no_fetch(url, path, tries=4):
    path = pathlib.Path(path)
    if path.exists() and path.stat().st_size > 0:
        return path
    raise FileNotFoundError(f'not cached: {path.name}')


def build(words, audio, passage, rng, per):
    s, a0, a1 = passage
    ayat = []
    for a in range(a0, a1 + 1):
        ch = ayah_chunks(words, audio, s, a)
        if ch is None:
            return None
        ayat.append((a, ch))
    lo = words.first_word(s, a0)
    hi = words.first_word(s, a1) + words.counts[words.vindex[(s, a1)]]
    order = list(range(1, len(ayat)))
    rng.shuffle(order)
    swaps, used = {}, set()
    for k in order:
        if len(swaps) >= per:
            break
        a, ch = ayat[k]
        if len(ch) < 3 or getattr(ch[-1], 'approx', False) or k in used or k - 1 in used or k + 1 in used:
            continue
        mine = normalize(ch[-1].text)
        # another ayah's ending that is another word: not one starting with the same three letters (تكذبان /
        # تكذبون is a word said wrong, not another ending)
        opts = [m for m in range(max(0, k - NEAR), min(len(ayat), k + NEAR + 1))
                if m != k and len(ayat[m][1]) >= 2 and not getattr(ayat[m][1][-1], 'approx', False)
                and normalize(ayat[m][1][-1].text)[:3] != mine[:3]]
        if not opts:
            continue
        m = rng.choice(opts)
        swaps[k] = m
        used.add(k)
    if not swaps:
        return None
    events = []
    chunks = [Chunk(silence(rng.uniform(0.6, 1.0)), None, 'pad')]
    for k, (a, ch) in enumerate(ayat):
        seq = list(ch)
        if k in swaps:
            m = swaps[k]
            o = ayat[m][1][-1]
            seq[-1] = Chunk(o.x, o.src, 'extra', None, o.text)
            prev = normalize(ch[-2].text)
            events.append({'id': len(events), 'type': 'end', 'ayah': a, 'words': [ch[-1].word],
                           'into': f'{s}:{ayat[m][0]}', 'from': len(ayat[m][1]) - 1, 'heard': o.text,
                           'same_before': normalize(ayat[m][1][-2].text) == prev, 'mistake': True})
        chunks.extend(seq)
        chunks.append(Chunk(silence(rng.uniform(0.6, 1.3)), None, 'pad'))
    parts = join(chunks)
    t, timeline = 0.0, []
    for c, x in zip(chunks, parts):
        d = len(x) / SR
        if c.role in ('word', 'extra'):
            timeline.append({'word': c.word, 'text': c.text, 'start': round(t, 3), 'end': round(t + d, 3),
                             'extra': c.role == 'extra'})
        t += d
    labels = {str(w): {'label': 'ok'} for w in range(lo, hi)}
    for ev in events:
        labels[str(ev['words'][0])] = {'label': 'end', 'event': ev['id']}
    return np.concatenate(parts).astype(np.float32), {'range': [lo, hi], 'sura': s, 'ayat': [a0, a1],
                                                      'events': events, 'timeline': timeline, 'labels': labels}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/bench-endings'))
    ap.add_argument('--cache', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/cache/qurancom'))
    ap.add_argument('--reciters', default='2,1,3,6,7,9,10,5')
    ap.add_argument('--per', type=int, default=3)
    ap.add_argument('--seed', type=int, default=11)
    args = ap.parse_args()
    bench.fetch = no_fetch
    words = Words()
    out = pathlib.Path(args.out)
    (out / 'items').mkdir(parents=True, exist_ok=True)
    index = []
    for r in [int(x) for x in args.reciters.split(',')]:
        audio = Audio(args.cache, r)
        for p, passage in bench.PASSAGES.items():
            rng = random.Random(f'{args.seed}-{r}-{p}')
            try:
                got = build(words, audio, passage, rng, args.per)
            except FileNotFoundError as e:
                bench.log(f'skip {bench.RECITERS[r]} {p}: {e}')
                continue
            if got is None:
                bench.log(f'skip {bench.RECITERS[r]} {p}: no ending to swap')
                continue
            x, truth = got
            y = floor_noise(x, rng)
            item = f'{bench.RECITERS[r]}.{p}.end.clean'
            pcm = np.clip(y * 32767, -32768, 32767).astype(np.int16)
            sf.write(out / 'items' / f'{item}.wav', pcm, SR, subtype='PCM_16')
            meta = {'id': item, 'reciter': bench.RECITERS[r], 'recitation': r, 'passage': p, 'variant': 'end',
                    'condition': 'clean', 'duration': round(len(y) / SR, 2),
                    'sha1': hashlib.sha1(pcm.tobytes()).hexdigest(), **truth}
            (out / 'items' / f'{item}.json').write_text(json.dumps(meta, ensure_ascii=False))
            index.append({k: meta[k] for k in ('id', 'reciter', 'passage', 'variant', 'condition', 'duration')})
            bench.log(f"built {item}: {meta['duration']} s, {len(truth['events'])} endings")
    (out / 'index.json').write_text(json.dumps(index, indent=1, ensure_ascii=False))
    bench.log(f'{len(index)} items, {sum(i["duration"] for i in index) / 60:.1f} min, {sum(1 for _ in index)}')


if __name__ == '__main__':
    main()
