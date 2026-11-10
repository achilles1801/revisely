"""qdat_bench through the general tajweed module (scripts/recite-eval/tajweed.py), to check it matches the
hand-written template, and to fit the thresholds the module will use elsewhere (at 5% false flags)."""
import json, os, pathlib, sys, math, collections
import numpy as np
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checker, tajweed  # noqa
from qdat_curves import curve  # noqa: E402
ear_name = sys.argv[1] if len(sys.argv) > 1 else 'hisn'
MODEL = sys.argv[2] if len(sys.argv) > 2 else 'count'
MIX = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
ear = checker.Hisn(threads=4)
from quran_transcript import Aya
ws = Aya(5, 109).get().uthmani.split(' ')
start = next(i for i, w in enumerate(ws) if w.startswith('قَالُو'))
sl = tajweed.Slots(ear).ayah(5, 109, words=(start, len(ws)))
names = ['qalo_alif_len', 'qalo_waw_len', 'laa_alif_len', 'separate_madd', 'noon_moshaddadah_len', 'noon_mokhfah_len',
         'allam_alif_len', 'madd_aared_len', 'qalqalah']
assert len(sl['slots']) == len(names), [(s['kind']) for s in sl['slots']]
meta = json.loads((LAB / 'data/qdat/index.json').read_text())
rows = []
for m in meta:
    lp = np.load(LAB / 'runs/qdat/logprobs' / ear_name / f"{m['id']}.npy").astype(np.float32)
    js = tajweed.judge(lp, ear, sl)
    for j in js:
        sc = np.array(j['scores']); pr = np.exp(sc - sc.max()); pr /= pr.sum()
        j['ecount'] = float(sum(len(v) * p_ for (v, _), p_ in zip(j['versions'], pr)))
    rows.append({'id': m['id'], 'truth': {k: m[k] for k in names}, 'j': {k: {x: j[x] for x in ('margin', 'count', 'timing', 'held', 'ecount')} for k, j in zip(names, js)}})
GOOD = {'noon_moshaddadah_len': 1, 'noon_mokhfah_len': 2, 'qalqalah': 1}
print(f'# {ear_name}, general module')
th = {}
for k in GOOD:
    y = np.array([r['truth'][k] != GOOD[k] for r in rows]); s = np.array([r['j'][k]['margin'] for r in rows])
    (c, auc) = curve(s, y)
    neg = s[~y]; th[k] = float(np.quantile(neg, 0.95))
    print(f'{k}: {int(y.sum())} wrong; caught at 2% false flags {100*c[0.02]:.0f}%, 5% {100*c[0.05]:.0f}%, 10% {100*c[0.1]:.0f}%; AUC {auc:.3f}; margin threshold at 5%: {th[k]:.2f}')
fold = np.random.default_rng(1).integers(0, 5, len(rows))
MADD = ['separate_madd', 'madd_aared_len', 'qalo_waw_len', 'qalo_alif_len', 'laa_alif_len', 'allam_alif_len']
def scale_on(idx):  # one scale for every madd: truth counts over measured ratio, median
    v = [r['truth'][k] / r['j'][k]['timing'] for i, r in enumerate(rows) if idx[i] for k in MADD
         if r['truth'][k] > 0 and r['j'][k]['timing']]
    return float(np.median(v))
scale = np.zeros(len(rows))
for f in range(5):
    scale[fold == f] = scale_on(fold != f)
th['madd_scale'] = scale_on(np.ones(len(rows), bool))
print('madd timing scale', round(th['madd_scale'], 3))
for k, sets in (('separate_madd', (2, 4, 5)), ('madd_aared_len', (2, 4, 6)), ('qalo_waw_len', (2,)), ('qalo_alif_len', (2,))):
    t = np.array([r['truth'][k] for r in rows], float)
    model = np.array([r['j'][k]['count' if MODEL == 'split' else MODEL] for r in rows], float)
    timing = np.array([r['j'][k]['timing'] if r['j'][k]['timing'] is not None else np.nan for r in rows])
    timing = np.where(np.isnan(timing), model, timing * scale)
    err = model - t
    line = f'{k}: model count exact {100*(err==0).mean():.0f}%, within 1 {100*(abs(err)<=1).mean():.0f}%, RMSE {math.sqrt((err**2).mean()):.2f}'
    est = (1 - MIX) * model + MIX * timing
    e2 = np.round(est) - t
    line += f'; with timing exact {100*(e2==0).mean():.0f}%, within 1 {100*(abs(e2)<=1).mean():.0f}%, RMSE {math.sqrt((e2**2).mean()):.2f}'
    print(line)
    for s in sets:
        truth = abs(t - s) >= 2
        if MODEL == 'split':  # too long: the timing helps; too short: the model's own count
            ec = np.array([r['j'][k]['ecount'] for r in rows], float)
            dist = np.maximum((0.7 * ec + 0.3 * timing) - s, s - ec)
        else:
            dist = abs(est - s)
        (c, auc) = curve(dist, truth)
        neg = dist[~truth]
        print(f'   setting {s}: {int(truth.sum())} wrong; caught at 2% {100*c[0.02]:.0f}%, 5% {100*c[0.05]:.0f}%; AUC {auc:.3f}; distance threshold at 5%: {np.quantile(neg, 0.95):.2f}')
        th[f'madd_{k}_{s}'] = float(np.quantile(neg, 0.95))
json.dump({'thresholds': th}, open(LAB / f'runs/qdat/generic.{ear_name}.json', 'w'))
json.dump(rows, open(LAB / f'runs/qdat/generic.rows.{ear_name}.json', 'w'))
