"""Mode 1 latency: a highlight from final frames only (look 1 s, as checker --live) vs one that also uses the
newest window's provisional frames (look 0). Clean-variant recordings (clean, 20 dB, 10 dB babble).

At each hop: the word the highlight is on, compared with the word being said right now (real time), split by
madd class; first time each word is highlighted minus its start; words highlighted before they were begun.
"""
import argparse, json, os, pathlib, sys, collections, ast
import numpy as np, soundfile as sf
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checker  # noqa
from follow_madd import madd_class, load  # noqa
FPS = 50
BENCH = LAB / 'data/bench-v0'

def cur_word(dec, g, app):
    d, gap = dec.d, dec.gap
    s, gi = int(np.argmax(d)), int(np.argmax(gap))
    if d[s] >= gap[gi]:
        return app[int(g.word_of[s])]
    return app[gi - 1] if gi > 0 else None

def item(path, hop, win, look):
    truth = load(path)
    P = dict(checker.DEFAULTS, sub_p=1.01)
    lo, hi = truth['range']
    kwa = checker.KEY.passage(truth.get('start_at', lo), truth.get('stop_at', hi), int(P['alts']))
    cls = {k['word']: madd_class(k) for k in kwa}
    app = [k['word'] for k in kwa]
    g = checker.Graph(kwa)
    x, _ = sf.read(path.with_suffix('.wav'), dtype='float32')
    sr, n = 16000, len(x)
    T = (1 + n // 160) // 2
    dec = checker.Decoder(g, P, T)
    tl = [e for e in truth['timeline'] if not e.get('extra')]
    starts = np.array([e['start'] for e in tl])
    first = {'final': {}, 'prov': {}}
    steps = []  # (mode, class, ok, ahead)
    k = 0
    while dec.t < T:
        k += 1
        t_end = min(int(round(k * hop * sr)), n)
        now = t_end / sr
        s0 = max(0, t_end - int(win * sr)); s0 -= s0 % 320
        lp = checker.EAR._run(x[s0:t_end])
        f0 = s0 // 320
        last = t_end >= n
        hi_f = T if last else min(T, int((now - look) * FPS))
        if hi_f > dec.t:
            a = dec.t
            rows = lp[a - f0:hi_f - f0]
            if len(rows) < hi_f - a:
                rows = np.concatenate([rows, np.repeat(lp[-1:], hi_f - a - len(rows), 0)])
            dec.feed(rows)
        if dec.t < 5:
            continue
        cf = cur_word(dec, g, app)
        # provisional: the rest of this window, then put the decoder back
        saved = (dec.d.copy(), dec.gap.copy(), dec.t)
        tail = lp[dec.t - f0:]
        if len(tail) and not last:
            dec.feed(tail[: T - dec.t])
        cp = cur_word(dec, g, app)
        dec.d, dec.gap, dec.t = saved
        i = int(np.searchsorted(starts, now, side='right')) - 1
        for mode, cw in (('final', cf), ('prov', cp)):
            if cw is None:
                continue
            first[mode].setdefault(cw, now)
            if i < 0:
                continue
            e = tl[i]
            inside = now < e['end']
            nxt = tl[i + 1]['word'] if i + 1 < len(tl) else None
            prv = tl[i - 1]['word'] if i else None
            edge = (e['end'] - now) < 0.15 or (now - e['start']) < 0.15
            ok = cw == e['word'] or (not inside and cw == nxt) or (edge and cw in (nxt, prv))
            c = cls.get(e['word'], 'none') if inside else 'pause'
            steps.append((mode, c, ok, cw > e['word'] and not ok))
    labels = {int(w): v for w, v in truth['labels'].items()}
    lags = []
    for mode in first:
        for w, t in first[mode].items():
            lab = labels.get(w)
            if lab and lab['label'] == 'ok':
                lags.append((mode, cls.get(w, 'none'), t - lab['start'], t < lab['start'] - 0.3))
    return truth['condition'], steps, lags

def _init():
    checker._init(1)

def _work(a):
    return item(*a)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--hop', type=float, default=0.25)
    ap.add_argument('--win', type=float, default=4.0)
    ap.add_argument('--look', type=float, default=1.0)
    ap.add_argument('--jobs', type=int, default=10)
    ap.add_argument('--only', default='.clean.')
    a = ap.parse_args()
    import multiprocessing as mp
    items = [f for f in sorted((BENCH / 'items').glob('*.json')) if a.only in f.name]
    pool = mp.get_context('spawn').Pool(a.jobs, initializer=_init)
    S = collections.defaultdict(lambda: [0, 0, 0]); L = collections.defaultdict(list)
    for n, (cond, steps, lags) in enumerate(pool.imap_unordered(_work, [(f, a.hop, a.win, a.look) for f in items]), 1):
        for mode, c, ok, ahead in steps:
            for key in ((cond, mode, c), (cond, mode, 'all')):
                s = S[key]; s[0] += 1; s[1] += ok; s[2] += ahead
        for mode, c, lag, early in lags:
            for key in ((cond, mode, c), (cond, mode, 'all')):
                L[key].append((lag, early))
        if n % 30 == 0:
            print(f'{n}/{len(items)}', file=sys.stderr, flush=True)
    q = lambda xs, p: sorted(xs)[min(len(xs) - 1, int(p * len(xs)))]
    print(f'hop {a.hop} win {a.win} look {a.look}')
    print('condition | highlight | being said | steps | right word now | ahead now | words | first shown - start, median / p90 | shown early')
    for key in sorted(S):
        s = S[key]; l = L.get(key, [])
        lg = [x[0] for x in l]
        print(f"{key[0]} | {key[1]} | {key[2]} | {s[0]} | {100*s[1]/s[0]:.1f}% | {100*s[2]/s[0]:.2f}% | {len(l)} | "
              + (f"{q(lg,.5):.2f} / {q(lg,.9):.2f} | {100*sum(x[1] for x in l)/len(l):.2f}%" if l else '-'))
