"""Mode 2 letters with named slips (scripts/recite-eval/letters.py): the best slip's margin per word on
professionals (clean variant of bench-v0, all words correct), learners (RetaSy, labelled per recording) and qdat
(5:109; a few transcripts hold letter or haraka slips). Thresholds are set on the professionals."""
import json, os, pathlib, sys, collections, ast
import numpy as np
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checker, tajweed, letters  # noqa
FPS = 50
PAD = 4
import os
LENGTHS = os.environ.get('LENGTHS', '1') == '1'

def words_judge(lp, word_sounds):
    """Align the passage's correct sounds, then judge each word with PAD symbols of context."""
    ph = ''.join(word_sounds)
    keep = [i for i, ch in enumerate(ph) if ch in EAR.index]
    pos_of = {i: k for k, i in enumerate(keep)}
    spans = tajweed.ctc_align(lp, [EAR.index[ph[i]] for i in keep])
    out, at = [], 0
    for snd in word_sounds:
        a, b = at, at + len(snd); at = b
        lo, hi = max(0, a - PAD), min(len(ph), b + PAD)
        ks = [pos_of[i] for i in range(lo, hi) if i in pos_of and pos_of[i] in spans]
        if not ks or not snd:
            out.append(None); continue
        f0 = max(0, spans[ks[0]][0] - 2); f1 = min(lp.shape[0], spans[ks[-1]][1] + 2)
        res = letters.judge_word(lp, EAR, ph[lo:a], snd, ph[b:hi], f0, f1, LENGTHS)
        out.append(res[0][:2] if res else None)
    return out

def load(p):
    t = json.loads(p.read_text())
    for k in ('timeline', 'labels', 'events', 'range'):
        if isinstance(t.get(k), str):
            t[k] = ast.literal_eval(t[k])
    return t

def pro_item(path):
    truth = load(path)
    lp = np.load(LAB / 'runs/v0/logprobs/hisn' / f"{truth['sha1']}.npy").astype(np.float32)
    tl = [e for e in truth['timeline'] if not e.get('extra')]
    by = collections.OrderedDict()
    for e in tl:
        s, a, p = KEY.where(e['word'])
        by.setdefault((s, a), []).append((p, e))
    out = []
    for (s, a), ws in by.items():
        ay = KEY.uthmani(s, a)
        if [p for p, _ in ws] != list(range(len(ay))):
            continue
        f0 = max(0, int((ws[0][1]['start'] - 0.3) * FPS)); f1 = min(lp.shape[0], int((ws[-1][1]['end'] + 0.3) * FPS))
        for r in words_judge(lp[f0:f1], KEY.phonetize(ay)):
            if r:
                out.append(('pro', truth['reciter'], r[0], r[1]))
    return out

def learner_item(path):
    t = json.loads(path.read_text())
    lp = np.load(LAB / 'runs/v0/logprobs/hisn' / f"{t.get('sha1') or t['id']}.npy").astype(np.float32)
    lo, hi = t['range']
    s, a, p0 = KEY.where(t.get('start_at', lo))
    ay = KEY.uthmani(s, a)
    ws = ay[p0:p0 + (hi - t.get('start_at', lo))]
    rs = [r for r in words_judge(lp, KEY.phonetize(ws)) if r]
    return [('learner-ok' if t['variant'] == 'learner-correct' else 'learner-bad', t['id'], max((r[0] for r in rs), default=-99),
             max(rs, key=lambda r: r[0])[1] if rs else None)]

def qdat_item(m):
    lp = np.load(LAB / 'runs/qdat/logprobs/hisn' / f"{m['id']}.npy").astype(np.float32)
    from quran_transcript import Aya
    ws = Aya(5, 109).get().uthmani.split(' ')
    st = next(i for i, w in enumerate(ws) if w.startswith('قَالُو'))
    rs = [r for r in words_judge(lp, KEY.phonetize(ws[st:])) if r]
    import re
    t = m['phonetic_transcript'].replace(' ', '')
    slip = not re.fullmatch(r'قَ(ا*)لُ(ۥ*)لَ(ا*)عِلمَلَنَ(ا*)ءِ(ن+)َكَءَ([نں]+)تَعَللَ(ا*)مُلغُيُ(ۥ*)ب(ڇ?)', t)
    return [('qdat-slip' if slip else 'qdat-ok', m['id'], max((r[0] for r in rs), default=-99), max(rs, key=lambda r: r[0])[1] if rs else None)]

def _init():
    global EAR, KEY
    checker._init(1)
    EAR, KEY = checker.EAR, checker.KEY

def _work(a):
    kind, x = a
    try:
        return {'pro': pro_item, 'learner': learner_item, 'qdat': qdat_item}[kind](x)
    except Exception as e:
        return [('error', str(x)[:60], repr(e)[:200], None)]

if __name__ == '__main__':
    import multiprocessing as mp
    work = [('pro', f) for f in sorted((LAB / 'data/bench-v0/items').glob('*.clean.clean.json'))]
    work += [('learner', f) for f in sorted((LAB / 'data/learners-v0/items').glob('*.json'))]
    work += [('qdat', m) for m in json.loads((LAB / 'data/qdat/index.json').read_text())]
    pool = mp.get_context('spawn').Pool(10, initializer=_init)
    rows = []
    for n, r in enumerate(pool.imap_unordered(_work, work), 1):
        rows += r
        if n % 100 == 0:
            print(n, len(work), file=sys.stderr, flush=True)
    json.dump(rows, open(LAB / f'runs/v0/letters_eval{"" if LENGTHS else ".nolen"}.json', 'w'), ensure_ascii=False)
    errs = [r for r in rows if r[0] == 'error']
    print('errors', len(errs), errs[:3])
    pro = np.array([r[2] for r in rows if r[0] == 'pro'])
    print(f'professional words: {len(pro)}')
    for fr in (0.001, 0.003, 0.01, 0.02):
        th = np.quantile(pro, 1 - fr)
        line = f'threshold for {100*fr:.1f}% of professional words flagged: {th:.2f} |'
        for g in ('learner-ok', 'learner-bad', 'qdat-ok', 'qdat-slip'):
            v = np.array([r[2] for r in rows if r[0] == g])
            line += f' {g} {100*(v > th).mean():.0f}% (n={len(v)})'
        print(line)
    th = np.quantile(pro, 0.99)
    print('slips heard on professionals above the 1% threshold:', collections.Counter(r[3] for r in rows if r[0] == 'pro' and r[2] > th).most_common(12))
    print('slips heard on correct learners above it:', collections.Counter(r[3] for r in rows if r[0] == 'learner-ok' and r[2] > th).most_common(12))
