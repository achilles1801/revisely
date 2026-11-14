"""Madd length from timing, measured several ways, on qdat_bench (159 learners, experts' counts).

The model counts long madds short (CTC has to emit a vowel once per count, with blanks between). A teacher
counts with time instead: how long the vowel is held, against the reciter's own count. This tries:

  held  how long the madd lasts
        emit   first sound of the haraka to the madd's last sound (tajweed.judge today)
        next   first sound of the haraka to the next letter's first sound
        voice  like next, cut where the voice drops away (a pause before the next word doesn't count)
  unit  the reciter's count
        twos   half the median held time of the 2-count madds in the same recording
        vowel  the median short syllable (a letter and its haraka) in the same recording
        none   seconds (one scale for everyone)

  python madd_timing.py [ear ...]      (logprobs from runs/qdat/logprobs/<ear>)
"""
import json
import math
import os
import pathlib
import sys

import numpy as np

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checker, tajweed  # noqa: E402
from qdat_curves import curve  # noqa: E402

HARAKA = 'َُِ'
LONG = tajweed.LONG


def frame_energy(x, n):
    """dB per 20 ms frame, n frames."""
    e = np.zeros(n)
    for f in range(n):
        s = x[f * 320:(f + 1) * 320]
        e[f] = 10 * math.log10(float((s.astype(np.float64) ** 2).mean()) + 1e-10) if len(s) else -100
    return e


def measure(lp, x, sl, index):
    """Per slot: held frames by each method, and the recording's units."""
    ph = sl['phonemes']
    keep = [i for i, ch in enumerate(ph) if ch in index]
    pos = {i: k for k, i in enumerate(keep)}
    labels = [index[ph[i]] for i in keep]
    spans = tajweed.ctc_align(lp, labels)
    emit = tajweed.ctc_align.emit
    en = frame_energy(x, lp.shape[0])
    out = []
    for s in sl['slots']:
        a, b = s['start'], s['end']
        r = {'emit': 0, 'next': 0, 'voice': 0}
        if s['symbol'] in LONG:
            first = pos.get(a - 1) if (a - 1) in pos and ph[a - 1] in HARAKA else pos.get(a)
            last = pos.get(b - 1)
            nxt = next((pos[i] for i in range(b, len(ph)) if i in pos), None)
            if first in emit and last in emit:
                f0 = emit[first][0]
                r['emit'] = emit[last][1] - f0
                f1 = emit[nxt][0] if nxt is not None and nxt in emit else spans[last][1]
                r['next'] = f1 - f0
                seg = en[f0:f1]
                if len(seg):
                    top = np.percentile(seg, 80)
                    on = np.where(seg > top - 12)[0]
                    r['voice'] = int(on[-1] + 1) if len(on) else r['next']
        out.append(r)
    # short syllables: a letter carrying a short haraka, from the letter's first sound to the next label's
    syl = []
    for i, ch in enumerate(ph):
        if ch in HARAKA and i + 1 < len(ph) and ph[i + 1] not in LONG and (i - 1) in pos and (i + 1) in pos:
            c, n_ = pos[i - 1], pos[i + 1]
            if c in emit and n_ in emit:
                syl.append(emit[n_][0] - emit[c][0])
    return out, (float(np.median(syl)) if syl else None)


def main():
    ears = sys.argv[1:] or ['hisn', 'ft5000']
    import soundfile as sf
    ear = checker.Hisn(threads=2)
    from quran_transcript import Aya
    ws = Aya(5, 109).get().uthmani.split(' ')
    st = next(i for i, w in enumerate(ws) if w.startswith('قَالُو'))
    sl = tajweed.Slots(ear).ayah(5, 109, words=(st, len(ws)))
    names = ['qalo_alif_len', 'qalo_waw_len', 'laa_alif_len', 'separate_madd', 'noon_moshaddadah_len',
             'noon_mokhfah_len', 'allam_alif_len', 'madd_aared_len', 'qalqalah']
    meta = json.loads((LAB / 'data/qdat/index.json').read_text())
    madd = [k for k, s in zip(names, sl['slots']) if s['symbol'] in LONG]
    twos = [k for k in madd if k not in ('separate_madd', 'madd_aared_len')]
    for en_ in ears:
        rows = []
        for m in meta:
            lp = np.load(LAB / 'runs/qdat/logprobs' / en_ / f"{m['id']}.npy").astype(np.float32)
            x, sr = sf.read(LAB / 'data/qdat' / f"{m['id']}.wav", dtype='float32')
            if x.ndim > 1:
                x = x.mean(1)
            got, vowel = measure(lp, x, sl, ear.index)
            rows.append({'id': m['id'], 'truth': {k: m[k] for k in names}, 'got': dict(zip(names, got)), 'vowel': vowel})
        gen = {r['id']: r['j'] for r in json.loads((LAB / f'runs/qdat/generic.rows.{en_}.json').read_text())}
        for r in rows:
            r['model'] = gen[r['id']]
        print(f'# {en_}: madd counts from timing (5-fold, one scale per method fitted on the other folds)')
        fold = np.random.default_rng(1).integers(0, 5, len(rows))
        for held in ('emit', 'next', 'voice'):
            for unit in ('twos', 'vowel', 'none'):
                def ratio(r, k):
                    h = r['got'][k][held]
                    if not h:
                        return None
                    if unit == 'twos':
                        t = [r['got'][q][held] for q in twos if r['got'][q][held]]
                        return h / (np.median(t) / 2) if len(t) >= 2 else None
                    if unit == 'vowel':
                        return h / r['vowel'] if r['vowel'] else None
                    return h / 25.0
                def scale(idx):
                    v = [r['truth'][k] / ratio(r, k) for i, r in enumerate(rows) if idx[i] for k in ('separate_madd', 'madd_aared_len')
                         if r['truth'][k] > 0 and ratio(r, k)]
                    return float(np.median(v))
                sc = np.zeros(len(rows))
                for f in range(5):
                    sc[fold == f] = scale(fold != f)
                line = f'{held:5s} / {unit:5s}:'
                for k, sets in (('separate_madd', (2, 4, 5)), ('madd_aared_len', (2, 4, 6))):
                    t = np.array([r['truth'][k] for r in rows], float)
                    est = np.array([(ratio(r, k) or 2.0) * sc[i] for i, r in enumerate(rows)])
                    e = np.round(est) - t
                    line += f'  {k[:8]} exact {100*(e==0).mean():3.0f}% within1 {100*(abs(e)<=1).mean():3.0f}%'
                    cs = []
                    for s_ in sets:
                        y = abs(t - s_) >= 2
                        c, auc = curve(abs(est - s_), y)
                        cs.append(f'{s_}:{100*c[0.05]:.0f}')
                    line += ' [' + ' '.join(cs) + ']'
                print(line)
        combine(rows, twos)
        w = pooled(rows, twos, madd)
        power(rows, float(os.environ.get('GAMMA', 0.6)))
        json.dump({'a': w[0], 'b': w[1], 'c': w[2]}, open(LAB / f'runs/qdat/madd_rule.{en_}.json', 'w'))


def combine(rows, twos):
    """The model's own count (good at short madds) with timing (next / vowel: good at long ones): count ~ a*timing +
    b*ecount + c, fitted on the other folds; and a split rule for a setting (longer than it: timing; shorter: ecount)."""
    fold = np.random.default_rng(1).integers(0, 5, len(rows))
    K = ('separate_madd', 'madd_aared_len')
    def feats(r, k):
        h = r['got'][k]['next']; t = h / r['vowel'] if (h and r['vowel']) else 2.0
        tw = [r['got'][q]['next'] for q in twos if r['got'][q]['next']]
        t2 = h / (np.median(tw) / 2) if (h and len(tw) >= 2) else t
        return [t, t2, r['model'][k]['ecount'], 1.0]
    for name, cols in (('ecount only', [2, 3]), ('timing only', [0, 3]), ('timing+ecount', [0, 2, 3]), ('both timings+ecount', [0, 1, 2, 3])):
        for k, sets in (('separate_madd', (2, 4, 5)), ('madd_aared_len', (2, 4, 6))):
            X = np.array([[feats(r, k)[c] for c in cols] for r in rows]); y = np.array([r['truth'][k] for r in rows], float)
            est = np.zeros(len(rows))
            for f in range(5):
                w, *_ = np.linalg.lstsq(X[fold != f], y[fold != f], rcond=None)
                est[fold == f] = X[fold == f] @ w
            e = np.round(est) - y
            cs = []
            for s_ in sets:
                yy = abs(y - s_) >= 2
                c, auc = curve(abs(est - s_), yy); cs.append(f'{s_}:{100*c[0.02]:.0f}/{100*c[0.05]:.0f}')
            print(f'{name:22s} {k[:8]} exact {100*(e==0).mean():3.0f}% within1 {100*(abs(e)<=1).mean():3.0f}% RMSE {math.sqrt((e**2).mean()):.2f}  caught at 2%/5% [' + ' '.join(cs) + ']')
    # split: for a setting s, longer than s judged by timing, shorter by ecount (each scaled on the other folds)
    for k, sets in (('separate_madd', (2, 4, 5)), ('madd_aared_len', (2, 4, 6))):
        y = np.array([r['truth'][k] for r in rows], float)
        T = np.array([feats(r, k)[0] for r in rows]); E = np.array([feats(r, k)[2] for r in rows])
        tsc = np.zeros(len(rows))
        for f in range(5):
            m = (fold != f) & (y > 0); tsc[fold == f] = np.median(y[m] / T[m])
        T = T * tsc
        cs = []
        for s_ in sets:
            yy = abs(y - s_) >= 2
            c, auc = curve(np.maximum(T - s_, s_ - E), yy); cs.append(f'{s_}:{100*c[0.02]:.0f}/{100*c[0.05]:.0f}')
        print(f'split rule             {k[:8]}  caught at 2%/5% [' + ' '.join(cs) + ']')



def pooled(rows, twos, kinds):
    """One rule for every madd kind (so it carries to any ayah): count ~ a*timing + b*ecount + c, fitted on the
    other folds over all kinds together. Prints per kind, and returns the rule fitted on everything."""
    fold = np.random.default_rng(1).integers(0, 5, len(rows))
    def f(r, k):
        h = r['got'][k]['next']; t = h / r['vowel'] if (h and r['vowel']) else 2.0
        return [t, r['model'][k]['ecount'], 1.0]
    X = np.array([f(r, k) for r in rows for k in kinds]); y = np.array([r['truth'][k] for r in rows for k in kinds], float)
    fo = np.repeat(fold, len(kinds)); kk = np.tile(np.arange(len(kinds)), len(rows))
    est = np.zeros(len(y))
    for q in range(5):
        w, *_ = np.linalg.lstsq(X[fo != q], y[fo != q], rcond=None); est[fo == q] = X[fo == q] @ w
    for i, k in enumerate(kinds):
        m = kk == i; e = np.round(est[m]) - y[m]
        sets = {'separate_madd': (2, 4, 5), 'madd_aared_len': (2, 4, 6)}.get(k, (2,))
        cs = []
        for s_ in sets:
            yy = abs(y[m] - s_) >= 2
            if yy.sum() >= 2:
                c, _ = curve(abs(est[m] - s_), yy); cs.append(f'{s_}:{100*c[0.02]:.0f}/{100*c[0.05]:.0f}')
        print(f'pooled {k:15s} exact {100*(e==0).mean():3.0f}% within1 {100*(abs(e)<=1).mean():3.0f}% caught [' + ' '.join(cs) + ']')
    w, *_ = np.linalg.lstsq(X, y, rcond=None)
    print('pooled rule: count = %.3f*timing + %.3f*ecount + %.3f' % tuple(w))
    return w



def power(rows, gamma=0.6):
    """count = 2 * (timing / 2) ** gamma, gamma fitted on the professionals (normal 2, lazim 6, each reciter's
    munfasil): nothing fitted on these learners. Also averaged with the model's count, and the split rule."""
    for k, sets in (('separate_madd', (2, 4, 5)), ('madd_aared_len', (2, 4, 6)), ('qalo_alif_len', (2,)), ('qalo_waw_len', (2,))):
        y = np.array([r['truth'][k] for r in rows], float)
        tv = np.array([(r['got'][k]['next'] / r['vowel']) if (r['got'][k]['next'] and r['vowel']) else np.nan for r in rows])
        E = np.array([r['model'][k]['ecount'] for r in rows])
        P = np.where(np.isnan(tv), E, 2 * (np.nan_to_num(tv, nan=2) / 2) ** gamma)
        for name, est, dist in (('power', P, None), ('power+ecount/2', (P + E) / 2, None), ('split', P, lambda s_: np.maximum(P - s_, s_ - E))):
            e = np.round(est) - y
            cs = []
            for s_ in sets:
                yy = abs(y - s_) >= 2
                if yy.sum() < 2:
                    continue
                d = dist(s_) if dist else abs(est - s_)
                c, _ = curve(d, yy); cs.append(f'{s_}:{100*c[0.02]:.0f}/{100*c[0.05]:.0f}')
            print(f'{name:15s} {k[:12]:12s} exact {100*(e==0).mean():3.0f}% within1 {100*(abs(e)<=1).mean():3.0f}% caught [' + ' '.join(cs) + ']')


if __name__ == '__main__':
    main()
