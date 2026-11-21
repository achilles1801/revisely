"""How much each tajweed check catches at a fixed share of false flags (qdat_bench, 5-fold cross-validation).

Binary rules (ghunnah of إنّك, ikhfa of أنت, qalqalah at the stop): a logistic score from (likelihood of the
best "mistake" version minus the best "correct" one, how long the sound was held over the reciter's count).
Madd with a user setting s: an estimated count (the model's own count and the timing, averaged), flagged when
it is far enough from s; a madd is wrong when it is 2+ counts off s.
"""
import json, os, pathlib, sys, math
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import qdat_eval as q
REF = ['qalo_alif_len', 'laa_alif_len', 'allam_alif_len']
GOOD = {'noon_moshaddadah_len': 1, 'noon_mokhfah_len': 2, 'qalqalah': 1}

def unit(r, skip=None):
    ds = [r['dur'][j][0] for j in REF if j != skip and j in r['dur'] and r['raw'][j] > 0]
    return np.median(ds) / 2 if ds else None

def logit_fit(X, y, l2=1e-2, iters=50):
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ w))
        g = X.T @ (p - y) + l2 * w
        H = X.T @ (X * (p * (1 - p))[:, None]) + l2 * np.eye(len(w))
        w -= np.linalg.solve(H, g)
    return w

def curve(score, truth):
    """Recall at <= 2% and <= 5% false flags, and AUC."""
    pos, neg = score[truth], score[~truth]
    out = {}
    for fr in (0.02, 0.05, 0.10):
        thr = np.quantile(neg, 1 - fr) if len(neg) else np.inf
        out[fr] = float((pos > thr).mean()) if len(pos) else float('nan')
    auc = float(np.mean([(p > n) + 0.5 * (p == n) for p in pos for n in neg])) if len(pos) and len(neg) else float('nan')
    return out, auc

def binary(rows, k, feats_used):
    fold = np.random.default_rng(1).integers(0, 5, len(rows))
    def feats(r):
        ll = r['ll'][k]
        good_opts = [o for o in ll if q.label_value(k, int(o) if k == 'qalqalah' else o) == GOOD[k]]
        bad_opts = [o for o in ll if o not in good_opts]
        f = {'margin': max(ll[o] for o in bad_opts) - max(ll[o] for o in good_opts)}
        u = unit(r)
        if k in r['dur'] and u:
            f['held'] = r['dur'][k][0] / u
        else:
            f['held'] = 2.0
        return [f[x] for x in feats_used] + [1.0]
    X = np.array([feats(r) for r in rows]); y = np.array([r['truth'][k] != GOOD[k] for r in rows])
    X[:, :-1] = np.clip(X[:, :-1], -50, 50)
    mu, sd = X[:, :-1].mean(0), X[:, :-1].std(0) + 1e-9
    X[:, :-1] = (X[:, :-1] - mu) / sd
    s = np.zeros(len(rows))
    for f in range(5):
        tr, te = fold != f, fold == f
        w = logit_fit(X[tr], y[tr].astype(float))
        s[te] = X[te] @ w
    return curve(s, y), int(y.sum())

def madd(rows, k, sets):
    fold = np.random.default_rng(1).integers(0, 5, len(rows))
    t = np.array([r['truth'][k] for r in rows], float)
    ll = [r['ll'][k] for r in rows]
    model = np.array([max(range(9), key=lambda c: d[str(c)]) for d in ll], float)
    ratio = np.array([(r['dur'].get(k, (0, 0))[0] / unit(r, k)) if unit(r, k) else 2.0 for r in rows])
    timing = np.zeros(len(rows))
    for f in range(5):
        tr, te = fold != f, fold == f
        ok = tr & (t > 0)
        timing[te] = ratio[te] / np.median(ratio[ok] / t[ok])
    out = {}
    for name, est in (('model', model), ('timing', timing), ('both', (model + timing) / 2)):
        res = []
        for s in sets:
            truth = abs(t - s) >= 2
            res.append((s, curve(abs(est - s), truth), int(truth.sum())))
        out[name] = res
    return out

if __name__ == '__main__':
    for ear in sys.argv[1:] or ['hisn', 'muaalem']:
        rows = json.loads((q.R / f'slots.{ear}.json').read_text())
        print(f'## {ear}')
        for k in GOOD:
            for fu in (['margin'], ['margin', 'held']):
                if k == 'qalqalah' and 'held' in fu:
                    continue
                (c, auc), n = binary(rows, k, fu)
                print(f"{k} [{'+'.join(fu)}] mistakes {n}: caught at 2% false flags {100*c[0.02]:.0f}%, at 5% {100*c[0.05]:.0f}%, at 10% {100*c[0.1]:.0f}%; AUC {auc:.3f}")
        for k, sets in (('separate_madd', (2, 4, 5)), ('madd_aared_len', (2, 4, 6)), ('qalo_waw_len', (2,))):
            m = madd(rows, k, sets)
            for name, res in m.items():
                print(f'{k} [{name}] ' + '; '.join(f'set {s}: {n} wrong, caught at 2% {100*c[0.02]:.0f}%, 5% {100*c[0.05]:.0f}%, AUC {auc:.3f}' for s, (c, auc), n in res))
