"""False flags of the tajweed module on professional recitation (bench-v0, clean variant: 8 reciters, no planted
mistakes; clean, 20 dB and 10 dB babble). Each ayah is cut from the recording by its word timings (each ayah is a
separate recording stopped on at its end) and judged with the thresholds fitted on qdat_bench (5% false flags).
Muttasil, munfasil and aared lengths vary by reciter, so for those the estimated counts are reported per reciter
instead of flagged."""
import json, os, pathlib, sys, collections, ast
import numpy as np
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checker, tajweed  # noqa
FPS = 50
TH = json.loads((LAB / 'runs/qdat/generic.hisn.json').read_text())['thresholds']
BIN = {'Qalqalah': TH['qalqalah'], 'Ikhfa': TH['noon_mokhfah_len'], 'Ikhfa meem': TH['noon_mokhfah_len'], 'Ghunnah': TH['noon_moshaddadah_len']}
FIXED = {'Normal Madd': (2, TH['madd_qalo_alif_len_2']), 'Lazem Madd': (6, TH['madd_madd_aared_len_6'])}

def load(p):
    t = json.loads(p.read_text())
    for k in ('timeline', 'labels', 'events', 'range'):
        if isinstance(t.get(k), str):
            t[k] = ast.literal_eval(t[k])
    return t

def item(path):
    truth = load(path)
    lp = np.load(LAB / 'runs/v0/logprobs/hisn' / f"{truth['sha1']}.npy").astype(np.float32)
    tl = [e for e in truth['timeline'] if not e.get('extra')]
    by = collections.OrderedDict()
    for e in tl:
        s, a, p = KEY.where(e['word'])
        by.setdefault((s, a), []).append((p, e))
    out = []
    for (s, a), ws in by.items():
        n = len(KEY.uthmani(s, a))
        if [p for p, _ in ws] != list(range(n)):
            continue  # only whole ayat said once, in order
        f0 = max(0, int((ws[0][1]['start'] - 0.3) * FPS)); f1 = min(lp.shape[0], int((ws[-1][1]['end'] + 0.3) * FPS))
        try:
            sl = SL.ayah(s, a)
            js = tajweed.judge(lp[f0:f1], EAR, sl)
        except Exception as ex:
            continue
        for j in js:
            sc = np.array(j['scores']); pr = np.exp(sc - sc.max()); pr /= pr.sum()
            ec = float(sum(len(v) * q for (v, _), q in zip(j['versions'], pr)))
            out.append((truth['reciter'], truth['condition'], j['kind'], j['margin'], ec, j['golden']))
    return out

def _init():
    global EAR, KEY, SL
    checker._init(1)
    EAR, KEY = checker.EAR, checker.KEY
    SL = tajweed.Slots(EAR)

if __name__ == '__main__':
    import multiprocessing as mp
    items = [f for f in sorted((LAB / 'data/bench-v0/items').glob('*.json')) if '.clean.' in f.name and f.name.split('.')[2] == 'clean']
    pool = mp.get_context('spawn').Pool(10, initializer=_init)
    rows = []
    for n, r in enumerate(pool.imap_unordered(item, items), 1):
        rows += r
        if n % 30 == 0:
            print(n, len(items), file=sys.stderr, flush=True)
    json.dump(rows, open(LAB / 'runs/v0/pros_tajweed.json', 'w'))
    print(f'{len(items)} recordings, {len(rows)} rule places')
    print('rule | condition | places | flagged (false) at the qdat threshold')
    agg = collections.defaultdict(lambda: [0, 0])
    for rec, cond, kind, margin, ec, golden in rows:
        if kind in BIN:
            a = agg[(kind, cond)]; a[0] += 1; a[1] += margin > BIN[kind]
        elif kind in FIXED:
            g, th = FIXED[kind]
            a = agg[(kind, cond)]; a[0] += 1; a[1] += abs(ec - g) >= th
    for k in sorted(agg):
        a = agg[k]
        print(f'{k[0]} | {k[1]} | {a[0]} | {a[1]} ({100*a[1]/a[0]:.1f}%)')
    print('estimated counts (clean audio), median per reciter:')
    per = collections.defaultdict(list)
    for rec, cond, kind, margin, ec, golden in rows:
        if cond == 'clean' and 'Madd' in kind:
            per[(rec, kind)].append(ec)
    kinds = ['Normal Madd', 'Mottasel Madd', 'Monfasel Madd', 'Aared Madd', 'Lazem Madd']
    print('reciter | ' + ' | '.join(kinds))
    for rec in sorted({r for r, _ in per}):
        print(rec + ' | ' + ' | '.join(f"{np.median(per[(rec, k)]):.1f} (n={len(per[(rec, k)])})" if per[(rec, k)] else '-' for k in kinds))
