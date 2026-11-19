#!/usr/bin/env python3
"""A planted harakat bench (Nov 18 2026, models WORKER 2): professionals' recitations (bench-v0's passages, cached
quran.com audio, nothing fetched) with words swapped for the same word said with different harakat, by the same
reciter elsewhere in the cached ayat (same letters, different vowels, shadda, sukun or madd: «ٱللَّهُ» said «ٱللَّهِ»).

Each planted item also carries controls: words swapped for the SAME word (identical harakat) said elsewhere, so a
mark that comes from the splice, not the harakat, shows up as a false alarm on a control.

  hsub   a mistake: the word said with other harakat (`ending` true when only its last vowel differs)
  same   not a mistake: the word said again from elsewhere, harakat identical

Never on an ayah's last word or a word before a pause mark (its last vowel isn't said), and never on the candidate's
side either. Items: <out>/items/<reciter>.<passage>.h1.<condition>.{wav,json} in bench-v0's format.
  python bench_harakat.py [--out data/bench-harakat] [--conditions clean,babble20]"""
import argparse
import hashlib
import json
import pathlib
import random
import re
import sys

import numpy as np
import soundfile as sf

H = pathlib.Path.home() / 'revisely-mistake-lab/code/harness/scripts/recite-eval'
sys.path.insert(0, str(H))
import bench  # noqa: E402

PAUSE = set(range(0x06D6, 0x06DD)) | {0x06DE, 0x06E9, 0x06EA, 0x06EB, 0x06EC}  # waqf signs and ornaments
DROP = {0x0640, 0x06E2, 0x06ED, 0x06DF, 0x06E0, 0x06E3, 0x06E4, 0x06E7, 0x06E8}  # tatweel, iqlab meem, small marks


def has_pause(u):
    return any(ord(ch) in PAUSE for ch in u)


def form(u):
    """The word as said in itself: letters with their harakat, shadda and dagger alif. Dropped: pause and tajweed
    signs, and what depends on the next or previous word, so a swap never "changes" only that: maddah (munfasil and
    muttasil signs), silah (small waw, ya), sukun (no mark is a sukun), the dagger alif on alif maqsura (shortened
    before a sakin), and a shadda on the first letter (idgham from the word before)."""
    out = []
    for ch in u:
        o = ord(ch)
        if o in PAUSE or o in DROP or o in (0x0653, 0x06E5, 0x06E6, 0x0652, 0x06E1):
            continue
        ch = {0x08F0: '\u064b', 0x08F1: '\u064c', 0x08F2: '\u064d'}.get(o, ch)
        if ch == '\u0670' and out and out[-1] == '\u0649':
            continue
        out.append(ch)
    f = ''.join(out)
    # a shadda on the first letter (after any vowel marks on it)
    m = re.match('^([^\u064b-\u0651])([\u064b-\u0650]*)\u0651', f)
    if m:
        f = m.group(1) + m.group(2) + f[m.end():]
    return f


HARAKAT = set('ًٌٍَُِ')


def last_vowel(f):
    """The word's last short vowel or tanween ('' when it ends without one: a sukun)."""
    k = len(f)
    while k and f[k - 1] == '\u0651':
        k -= 1
    return f[k - 1] if k and f[k - 1] in HARAKAT else ''


def body(f):
    k = len(f)
    while k and f[k - 1] in HARAKAT | {'\u0651'}:
        k -= 1
    return f[:k]


def only_ending(a, b):
    """True when the two forms differ only in their last vowel (case ending)."""
    return body(a) == body(b)


def contextual(a, b):
    """True when the forms differ only by a vowel at the end that one of them has only to join the next word
    («مِنْ» / «مِنَ ٱلنَّاسِ», «هُمْ» / «هُمُ ٱلْ…»): not a harakat slip."""
    return body(a) == body(b) and (last_vowel(a) == '' or last_vowel(b) == '')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/bench-harakat'))
    ap.add_argument('--cache', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/cache/qurancom'))
    ap.add_argument('--reciters', default='2,1,3,6,7,9,10,5')
    ap.add_argument('--passages', default=','.join(bench.PASSAGES))
    ap.add_argument('--conditions', default='clean,babble20')
    ap.add_argument('--per', type=int, default=6, help='planted mistakes per item (and as many controls, at most)')
    ap.add_argument('--seed', type=int, default=11)
    ap.add_argument('--count', action='store_true', help='only count the candidates')
    a = ap.parse_args()
    words = bench.Words()
    out = pathlib.Path(a.out)
    (out / 'items').mkdir(parents=True, exist_ok=True)
    built, babble = [], []
    tally = {'hsub': 0, 'ending': 0, 'same': 0, 'targets': 0}
    for r in [int(x) for x in a.reciters.split(',')]:
        audio = bench.Audio(a.cache, r)
        cached = sorted({(int(p.name[:3]), int(p.name[3:6])) for p in (pathlib.Path(a.cache) / str(r)).glob('*.mp3')})
        # the reciter's pool: every cached word that is said whole (not the ayah's last, no pause after it)
        pool = {}
        for s, ay in cached:
            ch = bench.ayah_chunks(words, audio, s, ay)
            if ch is None:
                continue
            uth = words.uthmani[words.vindex[(s, ay)]].split(' ')
            for i, c in enumerate(ch):
                if i == len(ch) - 1 or has_pause(uth[i]) or getattr(c, 'approx', False):
                    continue
                c.form = form(uth[i])
                pool.setdefault(bench.normalize(uth[i]), []).append(c)
        for p in a.passages.split(','):
            s, a0, a1 = bench.PASSAGES[p]
            ayat = []
            for ay in range(a0, a1 + 1):
                ch = bench.ayah_chunks(words, audio, s, ay)
                if ch is None:
                    ayat = None
                    break
                ayat.append((ay, ch, words.uthmani[words.vindex[(s, ay)]].split(' ')))
            if not ayat:
                print(f'skip {bench.RECITERS[r]} {p}: timings missing', file=sys.stderr)
                continue
            rng = random.Random(f'{a.seed}-{r}-{p}')
            flat = [(k, i) for k, (_, ch, _) in enumerate(ayat) for i in range(len(ch))]
            hs, ss = [], []
            for j, (k, i) in enumerate(flat):
                ay, ch, uth = ayat[k]
                c = ch[i]
                if j < 4 or i == len(ch) - 1 or has_pause(uth[i]) or getattr(c, 'approx', False):
                    continue
                f = form(uth[i])
                cands = [o for o in pool.get(bench.normalize(uth[i]), []) if o.src[1:3] != (s, ay)
                         and 0.6 < len(o.x) / max(1, len(c.x)) < 1.6]
                diff = [o for o in cands if o.form != f and not contextual(o.form, f)]
                same = [o for o in cands if o.form == f]
                if diff:
                    hs.append((j, rng.choice(diff)))
                if same:
                    ss.append((j, rng.choice(same)))
            tally['targets'] += len({j for j, _ in hs})
            rng.shuffle(hs)
            rng.shuffle(ss)
            taken, plan, events = set(), {}, []
            for kind, lst in (('hsub', hs), ('same', ss)):
                n = 0
                for j, o in lst:
                    if n >= a.per or any(abs(j - t) < 4 for t in taken):
                        continue
                    k, i = flat[j]
                    ay, ch, uth = ayat[k]
                    ev = {'id': len(events), 'type': kind, 'mistake': kind == 'hsub', 'words': [ch[i].word],
                          'expected': form(uth[i]), 'heard': o.form, 'from': f'{o.src[1]}:{o.src[2]}'}
                    if kind == 'hsub':
                        ev['ending'] = only_ending(form(uth[i]), o.form)
                        tally['ending'] += ev['ending']
                    tally[kind] += 1
                    taken.add(j)
                    plan[j] = (ev, o)
                    events.append(ev)
                    n += 1
            if a.count:
                continue
            chunks = [bench.Chunk(bench.silence(rng.uniform(0.6, 1.0)), None, 'pad')]
            for j, (k, i) in enumerate(flat):
                c = ayat[k][1][i]
                if j in plan:
                    o = plan[j][1]
                    chunks.append(bench.Chunk(o.x, o.src, 'word', c.word, o.text))
                else:
                    chunks.append(c)
                if i == len(ayat[k][1]) - 1:
                    chunks.append(bench.Chunk(bench.silence(rng.uniform(0.6, 1.3)), None, 'pad'))
            parts = bench.join(chunks)
            x = np.concatenate(parts).astype(np.float32)
            t, labels = 0.0, {}
            for c, y in zip(chunks, parts):
                d = len(y) / bench.SR
                if c.word is not None:
                    labels[c.word] = {'label': 'ok', 'start': round(t, 3), 'end': round(t + d, 3)}
                t += d
            for ev in events:
                labels[ev['words'][0]]['label'] = ev['type']
                labels[ev['words'][0]]['event'] = ev['id']
            lo = words.first_word(s, a0)
            hi = words.first_word(s, a1) + words.counts[words.vindex[(s, a1)]]
            truth = {'range': [lo, hi], 'sura': s, 'ayat': [a0, a1], 'events': events,
                     'labels': {str(w): v for w, v in sorted(labels.items())}}
            built.append((f'{bench.RECITERS[r]}.{p}.h1', r, p, x, truth))
            babble.append((r, x))
            print(f'built {bench.RECITERS[r]}.{p}.h1: {len(x) / bench.SR:.0f} s, '
                  f'{sum(e["type"] == "hsub" for e in events)} hsub, {sum(e["type"] == "same" for e in events)} same',
                  file=sys.stderr)
    print('candidates:', tally, file=sys.stderr)
    if a.count:
        return
    index = []
    for base, r, p, x, truth in built:
        for cond in a.conditions.split(','):
            rng = random.Random(f'{a.seed}-{base}-{cond}')
            if cond == 'clean':
                y = bench.floor_noise(x, rng)
            else:
                others = [bx for br, bx in babble if br != r]
                rng.shuffle(others)
                y = bench.add_noise(x, float(cond[len('babble'):]), others[:5], rng)
            item = f'{base}.{cond}'
            pcm = np.clip(y * 32767, -32768, 32767).astype(np.int16)
            sf.write(out / 'items' / f'{item}.wav', pcm, bench.SR, subtype='PCM_16')
            meta = {'id': item, 'reciter': bench.RECITERS[r], 'recitation': r, 'passage': p, 'variant': 'h1',
                    'condition': cond, 'duration': round(len(y) / bench.SR, 2),
                    'sha1': hashlib.sha1(pcm.tobytes()).hexdigest(), **truth}
            (out / 'items' / f'{item}.json').write_text(json.dumps(meta, ensure_ascii=False))
            index.append({k: meta[k] for k in ('id', 'reciter', 'passage', 'variant', 'condition', 'duration')})
    (out / 'index.json').write_text(json.dumps(index, indent=1, ensure_ascii=False))
    print(f'{len(index)} items, {sum(i["duration"] for i in index) / 3600:.2f} h, in {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
