"""Mode 1 through long madd: does the highlight hold the right word while a long vowel is held?

Part A (saved results): first-shown lag split by the longest madd in the word, today vs the live checker.
Part B (re-run, live decoder): at every step, the word the highlight is on vs the word being said at the
newest frame the checker has, split by whether that word holds a long madd.

  python -I follow_madd.py --part a
  python -I follow_madd.py --part b --jobs 10
"""
import argparse, json, os, pathlib, sys, collections, statistics
import numpy as np
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checker  # noqa

BENCH = LAB / 'data/bench-v0'
RUN = LAB / 'runs/v0'
FPS = 50

def madd_class(kw):
    m = 0
    f = kw['forms'][0]
    for l, c, fo in zip(f['labels'], f['counts'], f['fold']):
        if fo and checker.EAR.vocab[l - 1] in 'اۥۦ':
            m = max(m, c)
    return 'none' if m == 0 else 'madd2' if m <= 2 else 'madd4-5' if m <= 5 else 'madd6'

def load(item):
    t = json.loads(item.read_text())
    for k in ('timeline', 'labels', 'events', 'range'):
        if isinstance(t.get(k), str):
            import ast
            t[k] = ast.literal_eval(t[k])
    return t

def words_info(truth):
    lo, hi = truth['range']
    s0, s1 = truth.get('start_at', lo), truth.get('stop_at', hi)
    kws = checker.KEY.passage(s0, s1, 0)
    return kws, {k['word']: madd_class(k) for k in kws}

def part_a(names):
    checker._init(1)
    rows = collections.defaultdict(list)  # (name, cond, cls) -> [(lag_end, lag_start, dur, early)]
    for item in sorted((BENCH / 'items').glob('*.json')):
        truth = load(item)
        if truth['variant'] != 'clean':
            continue
        kws, cls = words_info(truth)
        labels = {int(k): v for k, v in truth['labels'].items()}
        for name in names:
            rp = RUN / 'results' / name / f"{truth['id']}.json"
            if not rp.exists():
                continue
            res = json.loads(rp.read_text())
            shown = {int(k): v for k, v in res['shown'].items()}
            for w, c in cls.items():
                lab = labels.get(w)
                if not lab or lab['label'] != 'ok':
                    continue
                if w not in shown:
                    rows[(name, truth['condition'], c)].append(None)
                    continue
                s = shown[w]
                rows[(name, truth['condition'], c)].append((s - lab['end'], s - lab['start'], lab['end'] - lab['start'], s < lab['start'] - 0.3))
    print('name | condition | words | n | dur med | shown-start med | shown-end med / p90 | shown before end | early | never shown')
    for key in sorted(rows):
        xs = rows[key]
        got = [x for x in xs if x]
        if not got:
            continue
        le = sorted(x[0] for x in got); ls = sorted(x[1] for x in got); du = sorted(x[2] for x in got)
        q = lambda a, p: a[min(len(a) - 1, int(p * len(a)))]
        print(f"{key[0]} | {key[1]} | {key[2]} | {len(xs)} | {q(du,.5):.2f} | {q(ls,.5):.2f} | {q(le,.5):.2f} / {q(le,.9):.2f} | "
              f"{100*sum(x[0] < 0 for x in got)/len(got):.0f}% | {100*sum(x[3] for x in got)/len(got):.2f}% | {100*(len(xs)-len(got))/len(xs):.2f}%")

def track_item(item):
    truth = load(item)
    P = dict(checker.DEFAULTS, sub_p=1.01, live=True)
    lo, hi = truth['range']
    kws, cls = words_info(truth)
    tag = f"hisn-live-w{P['win']:g}-h{P['hop']:g}-l{P['look']:g}"
    lp = np.load(RUN / 'logprobs' / tag / f"{truth.get('sha1') or truth['id']}.npy").astype(np.float32)
    kwa = checker.KEY.passage(truth.get('start_at', lo), truth.get('stop_at', hi), int(P['alts']))
    g = checker.Graph(kwa)
    dec = checker.Decoder(g, P, lp.shape[0])
    T = lp.shape[0]
    tl = [e for e in truth['timeline'] if not e.get('extra')]  # what was said, in order (with repeats)
    starts = np.array([e['start'] for e in tl]); ends = np.array([e['end'] for e in tl])
    app = [k['word'] for k in kwa]
    out = []
    k = 0
    prev_cur = None
    while True:
        k += 1
        now = k * P['hop']
        avail = T if now >= T / FPS + P['look'] - 1e-9 else max(0, min(T, int((now - P['look']) * FPS)))
        if avail > dec.t:
            dec.feed(lp[dec.t:avail])
        if dec.t >= 5:
            d, gap = dec.d, dec.gap
            s, gi = int(np.argmax(d)), int(np.argmax(gap))
            if d[s] >= gap[gi]:
                cur = app[int(g.word_of[s])]
            else:
                cur = app[gi - 1] if gi > 0 else None
            tau = dec.t / FPS
            i = int(np.searchsorted(starts, tau, side='right')) - 1
            if i >= 0 and cur is not None:
                e = tl[i]
                inside = tau < e['end']
                truth_w = e['word']
                nxt = tl[i + 1]['word'] if i + 1 < len(tl) else None
                near_edge = (e['end'] - tau) < 0.15 or (tau - e['start']) < 0.15
                ok = cur == truth_w or (not inside and cur == nxt) or (near_edge and cur in (nxt, tl[i - 1]['word'] if i else None))
                c = cls.get(truth_w, 'none') if inside else 'pause'
                out.append((c, ok, cur > truth_w and not ok, cur < truth_w and not ok, truth['condition'], truth['variant']))
            prev_cur = cur
        if dec.t >= T:
            break
    return truth['id'], out

def _init():
    checker._init(1)

def part_b(jobs, only):
    import multiprocessing as mp
    items = [f for f in sorted((BENCH / 'items').glob('*.json')) if only in f.name]
    pool = mp.get_context('spawn').Pool(jobs, initializer=_init)
    agg = collections.defaultdict(lambda: [0, 0, 0, 0])
    for n, (iid, rows) in enumerate(pool.imap_unordered(track_item, items), 1):
        for c, ok, ahead, behind, cond, var in rows:
            for key in ((cond, c), (cond, 'all words'), (cond + '/' + var, c)):
                a = agg[key]; a[0] += 1; a[1] += ok; a[2] += ahead; a[3] += behind
        if n % 60 == 0:
            print(f'{n}/{len(items)}', file=sys.stderr, flush=True)
    print('condition | being said | steps | on the right word | ahead | behind')
    for key in sorted(agg):
        if '/' in key[0] and not key[0].endswith('/clean'):
            continue
        a = agg[key]
        print(f"{key[0]} | {key[1]} | {a[0]} | {100*a[1]/a[0]:.1f}% | {100*a[2]/a[0]:.2f}% | {100*a[3]/a[0]:.2f}%")
    json.dump({f'{k[0]}|{k[1]}': v for k, v in agg.items()}, open(RUN / 'follow_madd.json', 'w'))

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--part', default='a')
    ap.add_argument('--jobs', type=int, default=10)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    if a.part == 'a':
        part_a(['develop.tarteel.x1', 'live.wp.w4'])
    else:
        part_b(a.jobs, a.only)
