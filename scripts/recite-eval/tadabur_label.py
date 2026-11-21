#!/usr/bin/env python3
"""Labels for the Tadabur slice (tadabur_fetch.py): each ayah's sounds as its reciter recited them.

The phonetizer writes an ayah's sounds once the madd lengths are known (munfasil 2/4/5, muttasil 4/5/6, the madd
before a stop 2/4/6), and reciters differ in them. A reciter keeps one length for each kind throughout (taswiyah),
so the lengths are measured, not guessed:
  pass 1  the current model on every ayah; each madd's count from timing and the model (tajweed.madd_count)
  pass 2  each reciter's median count per kind, rounded to the nearest allowed length; the ayah's sounds with
          those lengths, lined up with the model's output (for the planted slips); ayat the model and the labels
          disagree on (more than 15% of sounds) are left out: a wrong text, a cut in the wrong place, noise.

  python tadabur_label.py pass1 [--jobs 10]   -> data/tadabur/<name>.lp.npy (+ .est.pkl)
  python tadabur_label.py pass2 [--jobs 10]   -> data/train2/<name>.meta.pkl (+ a link to the audio)
"""
import argparse
import collections
import os
import pathlib
import pickle
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
SRC = LAB / 'data/tadabur'
# Tadabur's surah_id counts from 0 (ٱلْفَلَقِ is 112): every text matches Aya(surah_id + 1, ayah_id), checked on 3,565 ayat
SURA = lambda r: r['sura'] + 1
OUT = LAB / 'data/train2'
KINDS = {'Monfasel Madd': (2, 4, 5), 'Mottasel Madd': (4, 5, 6), 'Aared Madd': (2, 4, 6)}


def pass1(name):
    import checker, tajweed
    if (SRC / f'{name}.est.pkl').exists():
        return name, 'done before'
    ear = checker.Hisn(threads=1)
    SL = tajweed.Slots(ear)
    rows = pickle.load(open(SRC / f'{name}.rows.pkl', 'rb'))
    audio = np.load(SRC / f'{name}.audio.npy', mmap_mode='r')
    lps, est, off = [], [], 0
    for r in rows:
        x = audio[r['off']:r['off'] + r['n']].astype(np.float32) / 32768.0
        lp = ear.logprobs(x)
        lps.append(lp.astype(np.float16))
        e = {'lp_off': off, 'lp_n': lp.shape[0], 'counts': {}}
        off += lp.shape[0]
        try:
            js = tajweed.judge(lp, ear, SL.ayah(SURA(r), r['ayah']))
            for j in js:
                if j['kind'] in KINDS and j.get('tcount') is not None and j.get('timing_v') is not None:
                    e['counts'].setdefault(j['kind'], []).append(float(j['tcount']))
        except Exception as ex:
            e['error'] = repr(ex)[:120]
        est.append(e)
    np.save(SRC / f'{name}.lp.npy', np.concatenate(lps) if lps else np.zeros((0, 43), np.float16))
    pickle.dump(est, open(SRC / f'{name}.est.pkl', 'wb'))
    return name, f'{len(rows)} ayat'


def styles():
    """Each reciter's length per kind: the median measured count over all their ayat, to the nearest allowed."""
    per = collections.defaultdict(list)
    for p in sorted(SRC.glob('t*.est.pkl')):
        rows = pickle.load(open(SRC / p.name.replace('.est.pkl', '.rows.pkl'), 'rb'))
        for r, e in zip(rows, pickle.load(open(p, 'rb'))):
            for k, v in e['counts'].items():
                per[(r['reciter'], k)] += v
    st = {}
    for (rec, k), v in per.items():
        if len(v) >= 3:
            m = float(np.median(v))
            st.setdefault(rec, {})[k] = min(KINDS[k], key=lambda a: abs(a - m))
    return st


def pass2(args):
    name, st = args
    import Levenshtein
    import checker, tajweed
    from quran_transcript import Aya, MoshafAttributes, quran_phonetizer
    ear = checker.Hisn(threads=1)
    rows = pickle.load(open(SRC / f'{name}.rows.pkl', 'rb'))
    est = pickle.load(open(SRC / f'{name}.est.pkl', 'rb'))
    lpall = np.load(SRC / f'{name}.lp.npy', mmap_mode='r')
    metas, dropped = [], collections.Counter()
    cache = {}
    for r, e in zip(rows, est):
        s = st.get(r['reciter'], {})
        mon = s.get('Monfasel Madd', 4); mot = s.get('Mottasel Madd', 4); aar = s.get('Aared Madd', 4)
        mot = max(mot, mon) if mot in (4, 5, 6) else 4  # a munfasil is never longer than the muttasil
        key = (SURA(r), r['ayah'], mon, mot, aar)
        if key not in cache:
            try:
                moshaf = MoshafAttributes(rewaya='hafs', madd_monfasel_len=mon, madd_mottasel_len=mot,
                                          madd_mottasel_waqf=mot, madd_aared_len=aar)
                cache[key] = quran_phonetizer(Aya(SURA(r), r['ayah']).get().uthmani, moshaf, remove_spaces=True).phonemes
            except Exception:
                cache[key] = None
        ph = cache[key]
        if not ph:
            dropped['no text'] += 1; continue
        labels = [ear.index[c] for c in ph if c in ear.index]
        lp = np.asarray(lpall[e['lp_off']:e['lp_off'] + e['lp_n']], np.float32)
        if lp.shape[0] < 2 * len(labels) + 2:
            dropped['too short'] += 1; continue
        heard = ''.join(ear.vocab[k - 1] for k, _, _ in checker.heard_tokens(lp))
        ref = ''.join(ear.vocab[l - 1] for l in labels)
        per = Levenshtein.distance(ref, heard) / max(len(ref), 1)
        if per > 0.15:
            dropped['model and text disagree'] += 1; continue
        spans = tajweed.ctc_align(lp, labels)
        emit = tajweed.ctc_align.emit
        if len(emit) != len(labels):
            dropped['alignment'] += 1; continue
        fit = float(np.mean([lp[emit[i][0]:emit[i][1], labels[i]].max() for i in range(len(labels))]))
        metas.append({'off': r['off'], 'n': r['n'], 'labels': np.array(labels, np.int16),
                      'emit': np.array([emit[i] for i in range(len(labels))], np.int32),
                      'span': np.array([spans[i] for i in range(len(labels))], np.int32),
                      'fit': fit, 'per': per, 'moshaf': f'tadabur:{mon}/{mot}/{aar}', 'reciter': f"tadabur-{r['reciter']}",
                      'seg': f"{SURA(r)}:{r['ayah']}", 'uthmani': None})
    OUT.mkdir(parents=True, exist_ok=True)
    link = OUT / f'{name}.audio.npy'
    if not link.exists():
        link.symlink_to(SRC / f'{name}.audio.npy')
    pickle.dump(metas, open(OUT / f'{name}.meta.pkl', 'wb'))
    return name, f'{len(metas)} kept, dropped {dict(dropped)}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('step', choices=['pass1', 'pass2'])
    ap.add_argument('--jobs', type=int, default=10)
    a = ap.parse_args()
    names = sorted(p.name[:-len('.rows.pkl')] for p in SRC.glob('t*.rows.pkl'))
    import multiprocessing as mp
    with mp.get_context('spawn').Pool(a.jobs) as pool:
        if a.step == 'pass1':
            for name, msg in pool.imap_unordered(pass1, names):
                print(name, msg, flush=True)
        else:
            st = styles()
            c = collections.Counter(tuple(sorted(v.items())) for v in st.values())
            print(f'{len(st)} reciters; most common styles:', c.most_common(6), flush=True)
            pickle.dump(st, open(SRC / 'styles.pkl', 'wb'))
            names = [n for n in names if (SRC / f'{n}.est.pkl').exists()]
            for name, msg in pool.imap_unordered(pass2, [(n, st) for n in names]):
                print(name, msg, flush=True)


if __name__ == '__main__':
    main()
