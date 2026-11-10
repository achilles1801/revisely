"""Mode 3 on qdat_bench (159 learners, 5:109, expert tajweed labels; Apache-2.0).

Each tajweed slot of the ayah is decided by which version of the ayah the sound model finds likeliest (CTC
forward score), one slot at a time with the others at their current best, a few rounds. Slots: the madd
lengths (قالوا alif and waw, لا, the separated madd لنا إنك, علام, the madd before the stop الغيوب), the
ghunnah of إنّك, the ikhfa of أنت, the qalqalah at the stop.

  python -I qdat_eval.py --prepare      # once: qdat_bench's parquet (data/raw/qdat_bench) to 16 kHz WAVs + index.json
  python -I qdat_eval.py [--ear hisn|muaalem]
"""
import argparse, json, os, pathlib, sys, collections, math
import numpy as np, soundfile as sf
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checker  # noqa
D = LAB / 'data/qdat'; R = LAB / 'runs/qdat'
A, W = 'ا', 'ۥ'
SLOTS = {
    'qalo_alif_len': list(range(0, 9)), 'qalo_waw_len': list(range(0, 9)), 'laa_alif_len': list(range(0, 9)),
    'separate_madd': list(range(0, 9)), 'noon_moshaddadah_len': ['نن', 'ننن', 'نننن', 'ننننن'],
    'noon_mokhfah_len': ['ن', 'نن', 'ننن', 'ںں', 'ںںں', 'ںںںں'], 'allam_alif_len': list(range(0, 9)),
    'madd_aared_len': list(range(0, 9)), 'qalqalah': [0, 1],
}
CANON = {'qalo_alif_len': 2, 'qalo_waw_len': 2, 'laa_alif_len': 2, 'separate_madd': 4, 'noon_moshaddadah_len': 'نننن',
         'noon_mokhfah_len': 'ںںں', 'allam_alif_len': 2, 'madd_aared_len': 4, 'qalqalah': 1}

def text(v):
    return ('قَ' + A * v['qalo_alif_len'] + 'لُ' + W * v['qalo_waw_len'] + 'لَ' + A * v['laa_alif_len'] + 'عِلمَلَنَ'
            + A * v['separate_madd'] + 'ءِ' + v['noon_moshaddadah_len'] + 'َكَءَ' + v['noon_mokhfah_len'] + 'تَعَللَ'
            + A * v['allam_alif_len'] + 'مُلغُيُ' + W * v['madd_aared_len'] + 'ب' + ('ڇ' if v['qalqalah'] else ''))

def label_value(k, v):
    if k == 'noon_moshaddadah_len':
        return 1 if len(v) >= 4 else 0
    if k == 'noon_mokhfah_len':
        return 0 if 'ن' in v else (1 if len(v) <= 2 else 2)
    return v

def ctc_ll(lp, labels):
    """log P(labels | frames), CTC forward, blank = 0."""
    L = len(labels)
    S = 2 * L + 1
    ext = np.zeros(S, np.int64); ext[1::2] = labels
    skip = np.zeros(S, bool)
    skip[3::2] = np.array(labels[1:]) != np.array(labels[:-1]) if L > 1 else False
    NEG = -1e30
    a = np.full(S, NEG); a[0] = lp[0, 0]; a[1] = lp[0, ext[1]]
    for t in range(1, lp.shape[0]):
        b = a.copy()
        b[1:] = np.logaddexp(b[1:], a[:-1])
        s2 = np.full(S, NEG); s2[2:] = a[:-2]; s2[~skip] = NEG
        b = np.logaddexp(b, s2)
        a = b + lp[t, ext]
    return float(np.logaddexp(a[-1], a[-2]))

def per(ref, hyp):
    import Levenshtein
    return Levenshtein.distance(ref, hyp), len(ref)

class Hisn:
    def __init__(self):
        self.e = checker.Hisn(threads=4)
        self.vocab, self.index = self.e.vocab, self.e.index
    def logprobs(self, x):
        return self.e.logprobs(x)

class Muaalem:
    """Muaalem's phoneme head (w2v-BERT 2.0, 0.6B) as log-probabilities in HisnLabs' symbol order (blank first)."""
    def __init__(self, device='cpu'):
        import torch, os
        from quran_muaalem import Muaalem as M
        self.torch, self.device = torch, device
        self.m = M(device=device, dtype=torch.float32)
        hv = json.loads((LAB / 'models/hisnlabs-tajweed-v2/config.json').read_text())['phonemes']
        self.vocab, self.index = hv, {p: i + 1 for i, p in enumerate(hv)}
        i2v = self.m.multi_level_tokenizer.id_to_vocab['phonemes']
        v2i = {v: int(i) for i, v in i2v.items()}
        blank = min(int(i) for i in i2v)  # the CTC blank / pad token
        cols = [blank] + [v2i.get(p, -1) for p in hv]
        missing = [p for p, c in zip(hv, cols[1:]) if c < 0]
        if missing:
            print('muaalem lacks', missing, file=sys.stderr)
        self.cols = cols
        self.i2v = i2v
    def logprobs(self, x):
        torch = self.torch
        f = self.m.processor([x], sampling_rate=16000, return_tensors='pt')
        f = {k: v.to(self.device, dtype=torch.float32) for k, v in f.items()}
        with torch.no_grad():
            outs = self.m.model(**f, return_dict=False)[0]
        lp = torch.log_softmax(outs['phonemes'][0].float(), -1).cpu().numpy()
        out = np.full((lp.shape[0], len(self.cols)), -30.0, np.float32)
        for j, c in enumerate(self.cols):
            if c >= 0:
                out[:, j] = lp[:, c]
        return out

def prepare():
    import io
    import pyarrow.parquet as pq
    from math import gcd
    from scipy.signal import resample_poly
    D.mkdir(parents=True, exist_ok=True)
    meta = []
    for r in pq.read_table(LAB / 'data/raw/qdat_bench/train.parquet').to_pylist():
        x, sr = sf.read(io.BytesIO(r['audio']['bytes']), dtype='float32')
        if x.ndim > 1:
            x = x.mean(axis=1)
        if sr != 16000:
            g = gcd(sr, 16000); x = resample_poly(x, 16000 // g, sr // g).astype(np.float32)
        sf.write(D / f"{r['id']}.wav", x, 16000)
        meta.append(dict({k: v for k, v in r.items() if k != 'audio'}, sr_in=sr, duration=len(x) / 16000))
    (D / 'index.json').write_text(json.dumps(meta, ensure_ascii=False))
    print(len(meta), 'recordings')


def main():
    if '--prepare' in sys.argv:
        return prepare()
    ap = argparse.ArgumentParser()
    ap.add_argument('--ear', default='hisn')
    ap.add_argument('--rounds', type=int, default=3)
    ap.add_argument('--device', default='cpu')
    a = ap.parse_args()
    meta = json.loads((D / 'index.json').read_text())
    ear = Hisn() if a.ear == 'hisn' else Muaalem(a.device)
    cache = R / 'logprobs' / a.ear; cache.mkdir(parents=True, exist_ok=True)
    rows = []
    for n, m in enumerate(meta, 1):
        cp = cache / f"{m['id']}.npy"
        if cp.exists():
            lp = np.load(cp).astype(np.float32)
        else:
            x, _ = sf.read(D / f"{m['id']}.wav", dtype='float32')
            lp = ear.logprobs(x)
            np.save(cp, lp.astype(np.float16))
        lab = lambda s: [ear.index[c] for c in s if c in ear.index]
        v = dict(CANON)
        lls = {}
        for _ in range(a.rounds):
            for k, opts in SLOTS.items():
                sc = []
                for o in opts:
                    vv = dict(v, **{k: o})
                    sc.append(ctc_ll(lp, lab(text(vv))))
                v[k] = opts[int(np.argmax(sc))]
                lls[k] = dict(zip(map(str, opts), sc))
        greedy = ''.join(ear.vocab[t - 1] for t, _, _ in checker.heard_tokens(lp))
        truth_t = m['phonetic_transcript'].replace(' ', '')
        rows.append({'id': m['id'], 'pred': {k: label_value(k, v[k]) for k in SLOTS}, 'raw': v,
                     'truth': {k: m[k] for k in SLOTS}, 'll': lls, 'greedy': greedy, 'transcript': truth_t,
                     'per_greedy': per(truth_t, greedy), 'per_best': per(truth_t, text(v))})
        if n % 40 == 0:
            print(n, file=sys.stderr, flush=True)
    (R / f'slots.{a.ear}.json').write_text(json.dumps(rows, ensure_ascii=False))
    report(rows, a.ear)

def report(rows, name):
    print(f'# {name} on qdat_bench ({len(rows)} learners)')
    e = sum(r['per_greedy'][0] for r in rows); n = sum(r['per_greedy'][1] for r in rows)
    e2 = sum(r['per_best'][0] for r in rows)
    print(f'phoneme error rate: greedy {100*e/n:.2f}%, best version of the ayah {100*e2/n:.2f}%')
    for k in SLOTS:
        t = np.array([r['truth'][k] for r in rows]); p = np.array([r['pred'][k] for r in rows])
        if k in ('noon_moshaddadah_len', 'noon_mokhfah_len', 'qalqalah'):
            good = {'noon_moshaddadah_len': 1, 'noon_mokhfah_len': 2, 'qalqalah': 1}[k]
            tm, pm = t != good, p != good  # a mistake
            tp, fp, fn = int((tm & pm).sum()), int((~tm & pm).sum()), int((tm & ~pm).sum())
            f1 = 2 * tp / max(1, 2 * tp + fp + fn)
            tn = int((~tm & ~pm).sum())
            acc = (t == p).mean()
            # F1 of each class, averaged (as papers often report)
            f1g = 2 * tn / max(1, 2 * tn + fp + fn)
            print(f'{k}: accuracy {100*acc:.1f}%, mistakes {int(tm.sum())}: caught {tp}, missed {fn}, false flags {fp} of {int((~tm).sum())} correct; F1 mistake {f1:.2f}, macro F1 {(f1+f1g)/2:.2f}')
        else:
            err = p - t
            print(f'{k}: exact {100*(err==0).mean():.1f}%, within 1 {100*(abs(err)<=1).mean():.1f}%, RMSE {math.sqrt((err**2).mean()):.2f}, '
                  f'truth {dict(sorted(collections.Counter(t.tolist()).items()))}')
    for k, sets in (('separate_madd', (2, 4, 5)), ('madd_aared_len', (2, 4, 6))):
        t = np.array([r['truth'][k] for r in rows]); p = np.array([r['pred'][k] for r in rows])
        for s in sets:
            tf, pf = abs(t - s) >= 2, abs(p - s) >= 2
            tp, fp, fn = int((tf & pf).sum()), int((~tf & pf).sum()), int((tf & ~pf).sum())
            print(f'  setting {k} = {s}: off by 2+ counts {int(tf.sum())}: caught {tp}, missed {fn}, false flags {fp} of {int((~tf).sum())}')
        conf = collections.Counter(zip(t.tolist(), p.tolist()))
        print('  truth -> predicted:', dict(sorted(conf.items())))

if __name__ == '__main__':
    main()


def viterbi_align(lp, labels):
    """Best CTC path: for each frame, the index of the label it sits in (blank frames get the label before them
    if any, -1 before the first). Returns per-label (first frame, end frame) with blanks after a label counted
    with it."""
    L = len(labels); S = 2 * L + 1
    ext = np.zeros(S, np.int64); ext[1::2] = labels
    skip = np.zeros(S, bool)
    if L > 1:
        skip[3::2] = np.array(labels[1:]) != np.array(labels[:-1])
    T = lp.shape[0]; NEG = -1e30
    a = np.full(S, NEG); a[0] = lp[0, 0]; a[1] = lp[0, ext[1]]
    bp = np.zeros((T, S), np.int8)
    for t in range(1, T):
        c0 = a; c1 = np.full(S, NEG); c1[1:] = a[:-1]; c2 = np.full(S, NEG); c2[2:] = a[:-2]; c2[~skip] = NEG
        st = np.stack([c0, c1, c2]); k = st.argmax(0)
        a = st[k, np.arange(S)] + lp[t, ext]; bp[t] = k
    s = S - 1 if a[S - 1] >= a[S - 2] else S - 2
    states = np.zeros(T, np.int64)
    for t in range(T - 1, -1, -1):
        states[t] = s
        s -= int(bp[t, s])
    lab_of = np.where(states % 2 == 1, states // 2, (states - 1) // 2)  # blanks join the label before
    spans = {}
    for t, li in enumerate(lab_of):
        if li >= 0:
            f, e = spans.get(li, (t, t))
            spans[li] = (f, t + 1)
    return spans


def durations(lp, v, index):
    """Frames each madd slot is held, from the best path of the chosen version of the ayah (its vowel run, the
    blanks between its counts included, up to the next sound)."""
    pieces = [('qa', 'قَ'), ('qalo_alif_len', A * v['qalo_alif_len']), ('x', 'لُ'), ('qalo_waw_len', W * v['qalo_waw_len']),
              ('x', 'لَ'), ('laa_alif_len', A * v['laa_alif_len']), ('x', 'عِلمَلَنَ'), ('separate_madd', A * v['separate_madd']),
              ('x', 'ءِ'), ('noon_moshaddadah_len', v['noon_moshaddadah_len']), ('x', 'َكَءَ'), ('noon_mokhfah_len', v['noon_mokhfah_len']),
              ('x', 'تَعَللَ'), ('allam_alif_len', A * v['allam_alif_len']), ('x', 'مُلغُيُ'), ('madd_aared_len', W * v['madd_aared_len']),
              ('x', 'ب' + ('ڇ' if v['qalqalah'] else ''))]
    labels, owner = [], []
    for name, s in pieces:
        for c in s:
            labels.append(index[c]); owner.append(name)
    spans = viterbi_align(lp, labels)
    out = {}
    for li, (f, e) in spans.items():
        nm = owner[li]
        if nm in SLOTS:
            f0, e0 = out.get(nm, (f, e))
            out[nm] = (min(f0, f), max(e0, e))
    # the vowel before a madd slot (its short haraka) belongs to the sound too: include the preceding label
    pre = {}
    for li, nm in enumerate(owner):
        if nm in SLOTS and (li == 0 or owner[li - 1] != nm) and li - 1 in spans:
            pre[nm] = spans[li - 1]
    return {k: (e - f, pre.get(k, (0, 0))[1] - pre.get(k, (0, 0))[0]) for k, (f, e) in out.items()}


def timing(name='hisn'):
    rows = json.loads((R / f'slots.{name}.json').read_text())
    hv = json.loads((LAB / 'models/hisnlabs-tajweed-v2/config.json').read_text())['phonemes']
    index = {p: i + 1 for i, p in enumerate(hv)}
    for r in rows:
        lp = np.load(R / 'logprobs' / name / f"{r['id']}.npy").astype(np.float32)
        r['dur'] = durations(lp, r['raw'], index)
    (R / f'slots.{name}.json').write_text(json.dumps(rows, ensure_ascii=False))
    return rows
