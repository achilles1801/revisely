#!/usr/bin/env python3
"""Idgham and iqlab (lab, Nov 11 2026): was a noon sakinah or tanween merged or turned as the rule asks, or said
clearly (izhar), which is the mistake?

The phonetizer writes each place as the rule wants it, and its mapping says which sounds came from the noon:
  iqlab              مِنۢ بَعْدِ        the noon → ۾۾۾ (a meem with ghunnah) before ب
  idgham, ghunnah    مَن يَقُولُ        the noon → يي, then ي: the letter held, nasal (also و, م)
  idgham, no ghunnah هُدًى لِّلْ        the tanween keeps its vowel, the noon is gone, ل doubled (also ر)
For each place the sounds from the noon (or the tanween's noon) to the next letter are replaced by a clear ن and
that letter once; the margin is how much better (nats) that clear version fits the ayah's frames than the written
one. A noon before ن is left out: there the only difference is how long the ghunnah is held (the ghunnah check).

  python nasal_rules.py pros        margins at every place in bench-v0's professional recitation (they apply the rules)
  python nasal_rules.py record      margins at the /record items that ask for a missed rule (t6 iqlab, t8 idgham)
"""
import collections
import json
import os
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
FPS = 50
TANWEEN = set('ًٌٍ')
MARKS = set('ًٌٍَُِّْٰۭۢۜ۟۠ـ')  # signs that are not letters (harakat, sukun, shadda, small marks, tatweel)
STOPS = set('ۖۗۘۚۛ')  # waqf marks where a reciter may stop (ۙ, "do not stop", is not one)
_TANZIL = {}


def stops_after(s, a, n_words):
    """Word indices of ayah s:a followed by a waqf mark where a stop is allowed. A reciter who stops there says the
    noon clearly, so idgham and iqlab across that gap are the reciter's choice. From Tanzil's Uthmani text
    (data/tanzil_uthmani.json, alquran.cloud's quran-uthmani, the app's Arabic): quran_transcript's has no marks."""
    if not _TANZIL:
        f = LAB / 'data/tanzil_uthmani.json'
        if not f.exists():
            return set()
        for su in json.loads(f.read_text())['data']['surahs']:
            for ay in su['ayahs']:
                _TANZIL[(su['number'], ay['numberInSurah'])] = ay['text']
    text = _TANZIL.get((s, a))
    if not text:
        return set()
    words, after = 0, set()
    for t in text.split(' '):
        if t and all(0x6D6 <= ord(ch) <= 0x6DC for ch in t):
            if any(ch in STOPS for ch in t):
                after.add(words - 1)
        elif t:
            words += 1
    if words == n_words + 4:  # alquran.cloud puts the basmala at the start of each surah's first ayah
        after = {i - 4 for i in after if i >= 4}
    elif words != n_words:
        return set()
    return after


KINDS = {'ب': 'iqlab', 'ي': 'idgham', 'و': 'idgham', 'م': 'idgham', 'ل': 'idgham, no ghunnah', 'ر': 'idgham, no ghunnah'}


def places(uthmani, moshaf, stops=()):
    """(phonemes, [{'kind', 'r0', 'r1', 'clear', 'char'}]): ph[r0:r1] is what the rule makes of the noon and the
    letter after it; clear is the same said with a clear ن. stops: word indices followed by a waqf mark where a stop
    is allowed (stops_after); places across them are left out."""
    from quran_transcript import quran_phonetizer
    o = quran_phonetizer(uthmani, moshaf, remove_spaces=True)
    ph, mp = o.phonemes, o.mappings
    out = []
    n = len(uthmani)
    for c, ch in enumerate(uthmani):
        tanween = ch in TANWEEN
        if not (tanween or ch == 'ن'):
            continue
        k = c + 1
        if ch == 'ن':  # sakinah: no haraka or shadda on it
            while k < n and uthmani[k] in MARKS:
                if uthmani[k] in 'َُِّ':
                    break
                k += 1
            if k < n and uthmani[k] in 'َُِّ':
                continue
        # the next letter, across marks, a silent alif or ya (هُدًى), a space and a hamzat wasl
        while k < n and (uthmani[k] in MARKS or uthmani[k] in ' ٱاى'):
            k += 1
        if k >= n or uthmani[k] not in KINDS:
            continue
        if ' ' in uthmani[c:k] and uthmani[:c].count(' ') in stops:
            continue  # a stop is allowed between the two words: the reciter's choice
        L = uthmani[k]
        r0 = mp[c].pos[0] + 1 if tanween else mp[c].pos[0]  # a tanween's own vowel stays (it maps to ُوو: the vowel, then the held letter)
        r1 = mp[k].pos[1]
        if k + 1 < n and uthmani[k + 1] == 'ّ':
            r1 = max(r1, mp[k + 1].pos[1])
        seg = ph[r0:r1]
        if not seg or seg.startswith('ن') or L not in seg:
            continue  # said clearly as written (دُنْيَا, قِنْوَانٌ): no rule here
        out.append({'kind': KINDS[L], 'r0': r0, 'r1': r1, 'clear': 'ن' + L, 'char': c, 'written': seg})
    return ph, out


def nll(lp, labels):
    import torch
    import torch.nn.functional as F
    t = torch.from_numpy(np.ascontiguousarray(lp, np.float32))[:, None]
    return float(F.ctc_loss(t, torch.tensor([labels]), torch.tensor([lp.shape[0]]), torch.tensor([len(labels)]),
                            blank=0, reduction='sum', zero_infinity=True))


def judge(lp, ear, ph, pls):
    """Each place's margin: how much better (nats) the clear ن fits than the rule as written."""
    lab = lambda s: [ear.index[c] for c in s if c in ear.index]
    base = nll(lp, lab(ph))
    return [base - nll(lp, lab(ph[:p['r0']] + p['clear'] + ph[p['r1']:])) for p in pls]


def moshaf():
    from quran_transcript import MoshafAttributes
    return MoshafAttributes(rewaya='hafs', madd_monfasel_len=4, madd_mottasel_len=4, madd_mottasel_waqf=4,
                            madd_aared_len=4)


def _init():
    global EAR, KEY, M
    import checker
    checker._init(1)
    EAR, KEY, M = checker.EAR, checker.KEY, moshaf()


def pros_item(path):
    """bench-v0, clean variant: every whole ayah said once, cut by its word timings (as pros_tajweed.py)."""
    import pros_tajweed
    truth = pros_tajweed.load(path)
    lp = np.load(LAB / 'runs/v0/logprobs' / EAR_NAME / f"{truth['sha1']}.npy").astype(np.float32)
    by = collections.OrderedDict()
    for e in [e for e in truth['timeline'] if not e.get('extra')]:
        s, a, p = KEY.where(e['word'])
        by.setdefault((s, a), []).append((p, e))
    rows = []
    for (s, a), ws in by.items():
        if [p for p, _ in ws] != list(range(len(KEY.uthmani(s, a)))):
            continue
        f0 = max(0, int((ws[0][1]['start'] - 0.3) * FPS)); f1 = min(lp.shape[0], int((ws[-1][1]['end'] + 0.3) * FPS))
        try:
            ph, pls = places(' '.join(KEY.uthmani(s, a)), M, stops_after(s, a, len(KEY.uthmani(s, a))))
            if pls:
                for p, m in zip(pls, judge(lp[f0:f1], EAR, ph, pls)):
                    rows.append((truth['reciter'], truth['condition'], p['kind'], m, f'{s}:{a}', p['written']))
        except Exception:
            continue
    return rows


EAR_NAME = os.environ.get('EAR_NAME', 'hisn')
CONSONANTS = set('ءبتثجحخدذرزسشصضطظعغفقكلمنهوي')


def _listener():
    """The model that listens in the planted test: CKPT (a fine-tune) or the released model."""
    if os.environ.get('CKPT'):
        import hisn_torch
        return hisn_torch.Ear(os.environ['CKPT'], device='cpu')
    return EAR


def planted_item(path):
    """Professional recitation (bench-v0 clean) with each idgham or iqlab place said clearly instead: the place's
    sounds replaced by a clear noon sakinah (ن before a consonant, izhar) cut from elsewhere in the same recording,
    the letter after it kept. Each ayah is judged twice from its own audio, as recited and as planted."""
    import pros_tajweed, soundfile as sf, tajweed, augment
    ear = _listener()
    truth = pros_tajweed.load(path)
    x, sr = sf.read(path.with_suffix('.wav'), dtype='float32')
    if x.ndim > 1:
        x = x.mean(axis=1)
    lp_all = np.load(LAB / 'runs/v0/logprobs/hisn' / f"{truth['sha1']}.npy").astype(np.float32)
    by = collections.OrderedDict()
    for e in [e for e in truth['timeline'] if not e.get('extra')]:
        s, a, p = KEY.where(e['word'])
        by.setdefault((s, a), []).append((p, e))
    V = EAR.vocab
    ayat, noons = [], []
    for (s, a), ws in by.items():
        if [p for p, _ in ws] != list(range(len(KEY.uthmani(s, a)))):
            continue
        f0 = max(0, int((ws[0][1]['start'] - 0.3) * FPS)); f1 = min(lp_all.shape[0], int((ws[-1][1]['end'] + 0.3) * FPS))
        try:
            ph, pls = places(' '.join(KEY.uthmani(s, a)), M, stops_after(s, a, len(KEY.uthmani(s, a))))
        except Exception:
            continue
        keep = [i for i, c in enumerate(ph) if c in EAR.index]
        labels = [EAR.index[ph[i]] for i in keep]
        tajweed.ctc_align(lp_all[f0:f1], labels)
        emit = tajweed.ctc_align.emit
        if len(emit) != len(labels):
            continue
        for k in range(1, len(labels) - 1):  # clear noon sakinah: a single ن straight before a consonant
            if V[labels[k] - 1] == 'ن' and labels[k - 1] != labels[k] and V[labels[k + 1] - 1] in CONSONANTS \
                    and labels[k + 1] != labels[k]:
                a0, b0 = (f0 + emit[k][0] - 1) * 320, (f0 + emit[k][1] + 1) * 320
                if b0 - a0 >= 640:
                    noons.append(x[a0:b0].copy())
        ayat.append((s, a, f0, f1, ph, pls, keep, emit, labels))
    if not noons:
        return []
    rng = np.random.default_rng(__import__("zlib").crc32(truth["id"].encode()))
    rows = []
    for s, a, f0, f1, ph, pls, keep, emit, labels in ayat:
        if not pls:
            continue
        x0, x1 = f0 * 320, f1 * 320
        base = judge(ear.logprobs(x[x0:x1]), ear, ph, pls)
        pos = {p: k for k, p in enumerate(keep)}
        for p, m0 in zip(pls, base):
            ks = [pos[i] for i in range(p['r0'], p['r1']) if i in pos]
            if p['kind'] == 'iqlab':
                rep = [k for k in ks if V[labels[k] - 1] == '۾']  # the meem-ghunnah; ب stays
            else:
                rep = ks[:-1]  # the held letter but its last part, which stays as the letter said once
            if not rep or rep[-1] + 1 >= len(labels):
                continue
            nxt = rep[-1] + 1
            a0 = (f0 + emit[rep[0]][0]) * 320 - 320
            b0 = (f0 + (emit[rep[-1]][1] + emit[nxt][0]) // 2) * 320
            if b0 - a0 < 320:
                continue
            seg = noons[int(rng.integers(len(noons)))]
            y = augment.splice(x, a0, b0, seg)
            m1 = judge(ear.logprobs(y[x0:x1 + len(seg) - (b0 - a0)]), ear, ph, [p])[0]
            rows.append((truth['reciter'], p['kind'], m0, m1, f'{s}:{a}', p['written']))
    return rows


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else 'pros'
    if what == 'pros':
        import multiprocessing as mp
        items = [f for f in sorted((LAB / 'data/bench-v0/items').glob('*.json'))
                 if '.clean.' in f.name and f.name.split('.')[2] == 'clean']
        rows = []
        with mp.get_context('spawn').Pool(int(os.environ.get('JOBS', 1)), initializer=_init) as pool:
            for r in pool.imap_unordered(pros_item, items):
                rows += r
        out = LAB / f'runs/v0/nasal_pros.{EAR_NAME}.json'
        json.dump(rows, open(out, 'w'), ensure_ascii=False)
        print(f'{len(items)} recordings, {len(rows)} places -> {out}')
        by = collections.defaultdict(list)
        for rec, cond, kind, m, *_ in rows:
            by[(kind, cond)].append(m)
        bars = {}
        for kind in sorted({k for k, _ in by}):
            clean = np.array(by[(kind, 'clean')])
            bars[kind] = float(np.percentile(clean, 98)) if len(clean) else None
            line = f'{kind}: bar {bars[kind]:.1f} (2% of clean places over it)'
            for cond in ('clean', 'babble20', 'babble10'):
                v = np.array(by.get((kind, cond), []))
                if len(v):
                    line += f'; {cond} {len(v)} places, {100 * (v > bars[kind]).mean():.1f}% over'
            print(line)
        json.dump(bars, open(LAB / f'runs/v0/nasal_bars.{EAR_NAME}.json', 'w'), ensure_ascii=False)
    elif what == 'planted':
        import multiprocessing as mp
        items = [f for f in sorted((LAB / 'data/bench-v0/items').glob('*.json'))
                 if '.clean.' in f.name and f.name.split('.')[2] == 'clean']
        rows = []
        with mp.get_context('spawn').Pool(int(os.environ.get('JOBS', 1)), initializer=_init) as pool:
            for r in pool.imap_unordered(planted_item, items):
                rows += r
        tag = EAR_NAME if not os.environ.get('CKPT') else pathlib.Path(os.environ['CKPT']).parent.name
        json.dump(rows, open(LAB / f'runs/v0/nasal_planted.{tag}.json', 'w'), ensure_ascii=False)
        print(f'{tag}: {len(rows)} places; bar = 2% of places as recited flagged; caught = said clearly, over the bar')
        by = collections.defaultdict(list)
        for rec, kind, m0, m1, *_ in rows:
            by[kind].append((m0, m1))
        for kind, v in sorted(by.items()):
            v = np.array(v)
            bar = float(np.percentile(v[:, 0], 98))
            print(f'  {kind}: {len(v)} places, bar {bar:.1f}: caught {100 * (v[:, 1] > bar).mean():.0f}% '
                  f'(as recited {100 * (v[:, 0] > bar).mean():.0f}% flagged)')
    else:
        _init()
        import soundfile as sf
        bars = json.loads((LAB / f'runs/v0/nasal_bars.{EAR_NAME}.json').read_text())
        for f in sorted((LAB / 'data/record-v1/items').glob('*.json')):
            t = json.loads(f.read_text())
            if t.get('passage') not in ('t6', 't8'):
                continue
            x, _ = sf.read(f.with_suffix('.wav'), dtype='float32')
            lp = EAR.logprobs(x)
            ev = t['events'][0]
            asked = {KEY.where(w)[:2] for w in ev['words']}
            res = json.loads((LAB / 'runs/record-v1/results/rec.hisn.trail' / f"{t['id']}.json").read_text())
            import bench, record_check
            wins = record_check.ayah_windows(res, bench.Words(), sorted(asked), KEY, lp.shape[0])
            for (s, a) in sorted(asked):
                if (s, a) not in wins:
                    print(t['id'], f'{s}:{a} not found in the take'); continue
                f0, f1 = wins[(s, a)]
                ph, pls = places(' '.join(KEY.uthmani(s, a)), M, stops_after(s, a, len(KEY.uthmani(s, a))))
                ms = judge(lp[f0:f1], EAR, ph, pls)
                for p, m in zip(pls, ms):
                    bar = bars.get(p['kind'])
                    flag = bar is not None and m > bar
                    print(f"{t['id']} {s}:{a} {p['kind']} '{p['written']}' margin {m:.1f} (bar {bar:.1f}) "
                          f"{'FLAGGED' if flag else 'not flagged'}")


if __name__ == '__main__':
    main()
