"""Mode 2 letters, second try: every slip's margin kept (not only the best), a threshold per kind of slip, and a
shadda judged by time as well.

The first try flagged a word when its likeliest slip beat the correct sounds by one margin. On professionals the
false flags were mostly a vowel heard stretched (now judged by the madd timing, mode 3) and "no shadda" on و ل ي ن م:
a shadda is a held consonant, which CTC hears as badly as a long madd. So here:
  - length slips (a vowel lengthened, a madd dropped) are left to mode 3;
  - each kind of slip (ص→س, a haraka for another, no shadda...) gets its own threshold, set so all kinds together
    flag a given share of professionals' words (one share per kind, found by search);
  - "no shadda" counts only when the consonant was also short: held (to the next letter) under the reciter's pace
    times a factor set on the professionals.

  EAR_NAME=hisn python letters_v2.py        -> runs/v0/letters_v2.<ear>.json and a report
  python letters_v2.py --report <ear>        the report again from the saved rows
"""
import ast
import collections
import json
import os
import pathlib
import sys

import numpy as np

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checker, tajweed, letters  # noqa: E402

FPS = 50
PAD = 4
EAR_NAME = os.environ.get('EAR_NAME', 'hisn')
HARAKAT = 'َُِ'


def kind_of(why):
    if why.startswith('no shadda'):
        return 'shadda'
    if why.endswith('lengthened') or why == 'madd dropped':
        return 'length'
    if why[0] in HARAKAT:
        return 'haraka'
    return why  # a letter for another, each pair on its own (ص→س)


def words_judge(lp, word_sounds):
    """Per word: [(margin, why, held/pace or None, heard sounds, i, j)] for every slip (lengths left out); the
    slip is at word_sounds[k][i:j]."""
    ph = ''.join(word_sounds)
    keep = [i for i, ch in enumerate(ph) if ch in EAR.index]
    pos_of = {i: k for k, i in enumerate(keep)}
    spans = tajweed.ctc_align(lp, [EAR.index[ph[i]] for i in keep])
    emit = tajweed.ctc_align.emit
    syl = [emit[pos_of[i + 1]][0] - emit[pos_of[i - 1]][0] for i, ch in enumerate(ph)
           if ch in HARAKAT and i + 1 < len(ph) and ph[i + 1] not in 'اۥۦ' and (i - 1) in pos_of and (i + 1) in pos_of
           and pos_of[i - 1] in emit and pos_of[i + 1] in emit]
    pace = float(np.median(syl)) if len(syl) >= 3 else None
    out, at = [], 0
    for snd in word_sounds:
        a, b = at, at + len(snd); at = b
        lo, hi = max(0, a - PAD), min(len(ph), b + PAD)
        ks = [pos_of[i] for i in range(lo, hi) if i in pos_of and pos_of[i] in spans]
        if not ks or not snd:
            out.append(None); continue
        f0 = max(0, spans[ks[0]][0] - 2); f1 = min(lp.shape[0], spans[ks[-1]][1] + 2)
        res = letters.judge_word(lp, EAR, ph[lo:a], snd, ph[b:hi], f0, f1, lengths=False)
        rows = []
        for m, why, alt, i, j in res:
            held = None
            if why.startswith('no shadda') and pace:
                g0, g1 = a + i, a + j  # the doubled consonant in the passage
                nxt = next((pos_of[q] for q in range(g1, len(ph)) if q in pos_of), None)
                if g0 in pos_of and pos_of[g0] in emit and nxt is not None and nxt in emit:
                    held = (emit[nxt][0] - emit[pos_of[g0]][0]) / pace
            # (margin, why, held, the word's sounds with the slip, where in the word's sounds the slip is)
            rows.append((round(float(m), 3), why, None if held is None else round(held, 3), alt, i, j))
        out.append(rows)
    return out


def load(p):
    t = json.loads(p.read_text())
    for k in ('timeline', 'labels', 'events', 'range'):
        if isinstance(t.get(k), str):
            t[k] = ast.literal_eval(t[k])
    return t


def pro_item(path):
    truth = load(path)
    lp = np.load(LAB / 'runs/v0/logprobs' / EAR_NAME / f"{truth['sha1']}.npy").astype(np.float32)
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
        for k, r in enumerate(words_judge(lp[f0:f1], KEY.phonetize(ay))):
            if r is not None:
                out.append(('pro', f"{truth['reciter']}:{s}:{a}:{k}", [r]))
    return out


def learner_item(path):
    t = json.loads(path.read_text())
    lp = np.load(LAB / 'runs/v0/logprobs' / EAR_NAME / f"{t.get('sha1') or t['id']}.npy").astype(np.float32)
    lo, hi = t['range']
    s, a, p0 = KEY.where(t.get('start_at', lo))
    ay = KEY.uthmani(s, a)
    ws = ay[p0:p0 + (hi - t.get('start_at', lo))]
    rs = [r for r in words_judge(lp, KEY.phonetize(ws)) if r is not None]
    return [('learner-ok' if t['variant'] == 'learner-correct' else 'learner-bad', t['id'], rs)]


def qdat_item(m):
    import re
    lp = np.load(LAB / 'runs/qdat/logprobs' / EAR_NAME / f"{m['id']}.npy").astype(np.float32)
    from quran_transcript import Aya
    ws = Aya(5, 109).get().uthmani.split(' ')
    st = next(i for i, w in enumerate(ws) if w.startswith('قَالُو'))
    rs = [r for r in words_judge(lp, KEY.phonetize(ws[st:])) if r is not None]
    t = m['phonetic_transcript'].replace(' ', '')
    slip = not re.fullmatch(r'قَ(ا*)لُ(ۥ*)لَ(ا*)عِلمَلَنَ(ا*)ءِ(ن+)َكَءَ([نں]+)تَعَللَ(ا*)مُلغُيُ(ۥ*)ب(ڇ?)', t)
    return [('qdat-slip' if slip else 'qdat-ok', m['id'], rs)]


def _init():
    global EAR, KEY
    checker._init(1)
    EAR, KEY = checker.EAR, checker.KEY


def _work(a):
    kind, x = a
    try:
        return {'pro': pro_item, 'learner': learner_item, 'qdat': qdat_item}[kind](x)
    except Exception as e:
        return [('error', str(x)[:60], repr(e)[:200])]


def word_score(word, th, shadda_max):
    """Largest margin over its threshold among the word's slips (> 0: flagged), and that slip."""
    best, why_ = -1e9, None
    for m, why, held, *_ in word:
        k = kind_of(why)
        if k == 'length':
            continue
        if k == 'shadda' and (held is None or held > shadda_max):
            continue  # the consonant was held long enough: not a missing shadda
        t = th.get(k, th['_letter'] if k not in ('haraka', 'shadda') else th[k])
        if m - t > best:
            best, why_ = m - t, why
    return best, why_


def thresholds(pro_words, q):
    by = collections.defaultdict(list)
    for w in pro_words:
        for m, why, held, *_ in w:
            by[kind_of(why)].append(m)
    letters_all = [m for k, v in by.items() if k not in ('haraka', 'shadda', 'length') for m in v]
    th = {'_letter': float(np.quantile(letters_all, 1 - q))}
    for k, v in by.items():
        if k == 'length':
            continue
        th[k] = float(np.quantile(v, 1 - q)) if len(v) >= 300 else th['_letter'] if k not in ('haraka', 'shadda') else float(np.quantile(v, 1 - q))
    return th


def report(rows):
    pro_words = [r[2][0] for r in rows if r[0] == 'pro']
    shadda_held = [held for w in pro_words for m, why, held, *_ in w if why.startswith('no shadda') and held is not None]
    print(f'professional words: {len(pro_words)}; doubled consonants with a time: {len(shadda_held)}')
    print('doubled consonant held (to the next letter), in short syllables, professionals: '
          + ', '.join(f'{p}%: {np.percentile(shadda_held, p):.2f}' for p in (1, 5, 10, 50)))
    groups = ('learner-ok', 'learner-bad', 'qdat-ok', 'qdat-slip')
    for shadda_pct in (None, 5):
        shadda_max = 1e9 if shadda_pct is None else float(np.percentile(shadda_held, shadda_pct))
        name = 'no time check on shadda' if shadda_pct is None else f'shadda only if held under {shadda_max:.2f} (5% of professionals)'
        print(f'-- per-kind thresholds, {name}')
        for target in (0.001, 0.003, 0.01, 0.02):
            lo, hi = 1e-6, 0.5
            for _ in range(40):  # one share per kind, searched so professionals' words flagged = target
                q = (lo + hi) / 2
                th = thresholds(pro_words, q)
                rate = np.mean([word_score(w, th, shadda_max)[0] > 0 for w in pro_words])
                lo, hi = (q, hi) if rate < target else (lo, q)
            line = f'{100*target:.1f}% of professional words flagged:'
            for g in groups:
                v = [max((word_score(w, th, shadda_max)[0] for w in r[2]), default=-1e9) > 0 for r in rows if r[0] == g]
                line += f' {g} {100*np.mean(v):.0f}% (n={len(v)})'
            print(line)
            if target == 0.01:
                th01, sm01 = th, shadda_max
        print('   at 1%, slips flagged on professionals:', collections.Counter(word_score(w, th01, sm01)[1] for w in pro_words if word_score(w, th01, sm01)[0] > 0).most_common(8))
        print('   on correct learners:', collections.Counter(word_score(w, th01, sm01)[1] for r in rows if r[0] == 'learner-ok' for w in r[2] if word_score(w, th01, sm01)[0] > 0).most_common(8))
        print('   on qdat slips:', collections.Counter(word_score(w, th01, sm01)[1] for r in rows if r[0] == 'qdat-slip' for w in r[2] if word_score(w, th01, sm01)[0] > 0).most_common(8))

def report_global(rows, shadda_pcts=(None, 5, 10)):
    """One bar for every slip (the slip must beat the correct sounds by a margin), with and without the time check
    on shadda. Length slips stay out (mode 3 / timing)."""
    pro_words = [r[2][0] for r in rows if r[0] == 'pro']
    shadda_held = [held for w in pro_words for m, why, held, *_ in w if why.startswith('no shadda') and held is not None]
    groups = ('learner-ok', 'learner-bad', 'qdat-ok', 'qdat-slip')
    def best(w, smax):
        b, wy = -1e9, None
        for m, why, held, *_ in w:
            k = kind_of(why)
            if k == 'length' or (k == 'shadda' and (held is None or held > smax)):
                continue
            if m > b:
                b, wy = m, why
        return b, wy
    for sp in shadda_pcts:
        smax = 1e9 if sp is None else float(np.percentile(shadda_held, sp))
        print(f'-- one bar, ' + ('no time check on shadda' if sp is None else f'shadda only if held under {smax:.2f} ({sp}% of professionals)'))
        pro = np.array([best(w, smax)[0] for w in pro_words])
        for target in (0.001, 0.003, 0.01, 0.02):
            th = np.quantile(pro, 1 - target)
            line = f'{100*target:.1f}% of professional words flagged (bar {th:.1f}):'
            for g in groups:
                v = [max((best(w, smax)[0] for w in r[2]), default=-1e9) > th for r in rows if r[0] == g]
                line += f' {g} {100*np.mean(v):.0f}%'
            print(line)
        th = np.quantile(pro, 0.99)
        print('   at 1%, on professionals:', collections.Counter(best(w, smax)[1] for w in pro_words if best(w, smax)[0] > th).most_common(6))
        print('   on correct learners:', collections.Counter(best(w, smax)[1] for r in rows if r[0] == 'learner-ok' for w in r[2] if best(w, smax)[0] > th).most_common(6))



if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--report':
        rows = json.load(open(LAB / f'runs/v0/letters_v2.{sys.argv[2]}.json'))
        report_global(rows)
        sys.exit()
    import multiprocessing as mp
    work = [('pro', f) for f in sorted((LAB / 'data/bench-v0/items').glob('*.clean.clean.json'))]
    work += [('learner', f) for f in sorted((LAB / 'data/learners-v0/items').glob('*.json'))]
    work += [('qdat', m) for m in json.loads((LAB / 'data/qdat/index.json').read_text())]
    pool = mp.get_context('spawn').Pool(int(os.environ.get('JOBS', 10)), initializer=_init)
    rows = []
    for n, r in enumerate(pool.imap_unordered(_work, work), 1):
        rows += r
        if n % 100 == 0:
            print(n, len(work), file=sys.stderr, flush=True)
    errs = [r for r in rows if r[0] == 'error']
    print('errors', len(errs), errs[:3])
    rows = [r for r in rows if r[0] != 'error']
    json.dump(rows, open(LAB / f'runs/v0/letters_v2.{EAR_NAME}.json', 'w'), ensure_ascii=False)
    report_global(rows)
