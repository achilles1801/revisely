#!/usr/bin/env python3
"""Volunteers' /record takes (bench v1, record_bench.py), checked item by item, automatically. No person listens to the
takes, ever (the page promises it): every judgement here is the software's.

For each take:
- **Did the volunteer do what the item asked?** The whole take is scored two ways by the sound model: against the
  passage as written, and against the passage with the asked mistake (the item's own text: a word left out, a word
  swapped, a letter or haraka changed...). Each ayah is phonetized on its own, stopped on, as reciters stop at ayah
  ends. Whichever version fits better, and by how much, says whether the instruction produced the recording it asked
  for. Both the released model and v3 judge, so one model's blind spot shows.
- **Did the checker catch it?**
  - word mistakes: the words check (checker.py results, recommended settings);
  - letters and harakat: letters_v2's slips on the planted word, against the bar that flags 3 in 1,000 professional
    words;
  - tajweed: the tajweed module (timing included) at the planted places.
- **False alarms** on the items recited as written (and on the slips: going back, a pause, a repeat).

  python record_check.py --bench data/record-v1 --run runs/record-v1 --words rec.hisn.wp [--v3 models/ft-v3/step8000.pt]
"""
import argparse
import ast
import json
import os
import pathlib
import sys

import numpy as np

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import checker, tajweed, letters_v2  # noqa: E402

FPS = 50


def lit(v):
    return ast.literal_eval(v) if isinstance(v, str) else v


HARAKAT = 'َُِ'
# the script writes these two asked words without vowels; their Quranic forms (113:3's last word, and as in 2:37)
FULL = {'وقب': 'وَقَبَ', 'الرحيم': 'ٱلرَّحِيمُ'}


def base(w):
    """Letters only, hamza seats folded to ء."""
    out = ''
    for ch in w:
        if ch in 'أإآؤئ':
            out += 'ء'
        elif ch == 'ٱ':
            out += 'ا'
        elif '\u0621' <= ch <= '\u064a':
            out += ch
    return out


def change_sounds(snd, item):
    """The planted word's sounds as the item asks them said (from the word as written and the 'said' form)."""
    import difflib
    k = item['truth']['kind']; right, said = item['_right'], item['truth']['said']
    if k == 'vowel_length':
        return ''.join(ch for ch in snd if ch not in 'اۥۦ')
    if k == 'letter':  # the title names the swap: "... ت for ط"
        import re
        m = re.search(r'(\S) for (\S)\s*$', item['title'])
        b, a = base(m.group(1)), base(m.group(2))
        if a not in snd:
            raise ValueError(f'{a} not in {snd}')
        return snd.replace(a, b)
    if k == 'haraka':
        hr, hs = [c for c in right if c in HARAKAT], [c for c in said if c in HARAKAT]
        i = next(i for i in range(min(len(hr), len(hs))) if hr[i] != hs[i])
        j = snd.rfind(hr[i])
        return snd[:j] + hs[i] + snd[j + 1:]
    if k == 'shadda':
        x = right[right.index('\u0651') - 1]
        j = snd.find(x + x)
        if j < 0:
            raise ValueError(f'no doubled {x} in {snd}')
        return snd[:j] + snd[j + 1:]
    raise ValueError(k)


def ayah_sounds(KEY, s, a, words=None, slip=None):
    """Sounds of one ayah, word by word (the checker's own forms); words: a changed word list; slip: (word index,
    item) says the item's planted word as the item asks."""
    ws = KEY.phonetize(words if words is not None else list(KEY.uthmani(s, a)))
    if slip:
        wi, item = slip
        ws = ws[:wi] + [change_sounds(ws[wi], item)] + ws[wi + 1:]
    return ''.join(ws)


def passage(KEY, ayat, change=None):
    """Sounds of the passage. change: {(s, a): ('words', [...]) | ('slip', i, desc) | None (left out)},
    and 'append': [(s, a)] for ayat said after the passage."""
    change = change or {}
    out = ''
    for s, a in ayat:
        c = change.get((s, a), 'same')
        if c is None:
            continue
        if c == 'same':
            out += ayah_sounds(KEY, s, a)
        elif c[0] == 'words':
            out += ayah_sounds(KEY, s, a, words=c[1])
        else:
            out += ayah_sounds(KEY, s, a, slip=(c[1], c[2]))
    for s, a in change.get('append', []):
        out += ayah_sounds(KEY, s, a)
    return out


def fit(lp, index, ph):
    labels = [index[c] for c in ph if c in index]
    return tajweed.ctc_ll(lp, labels) if len(labels) * 2 + 1 <= lp.shape[0] else -1e9


def asked_version(item, KEY):
    """The passage change this item asks for, or None when it asks for none (or for tajweed only)."""
    t = item['truth']; k = t['kind']
    ay = lambda s, a: list(KEY.uthmani(s, a))
    if k == 'del':
        x = t['at'][0]; w = ay(x['s'], x['a']); del w[x['w']]
        return {(x['s'], x['a']): ('words', w)}
    if k == 'sub' and item['id'] == 'w3':  # ayah 48 said with ayah 123's wording
        return {(2, 48): ('words', ay(2, 123))}
    if k == 'sub':  # the title holds the ayah's end as said
        x = t['at'][0]; w = ay(x['s'], x['a']); w[x['w']] = FULL.get(t['said'], t['said'])
        return {(x['s'], x['a']): ('words', w)}
    if k == 'ins':
        x = t['after']; w = ay(x['s'], x['a']); w.insert(x['w'] + 1, FULL.get(t['said'], t['said']))
        return {(x['s'], x['a']): ('words', w)}
    if k == 'skip_ayah':
        return {tuple(t['ayah']): None}
    if k == 'jump':  # Al-Baqarah 3-5, then Luqman 6
        return {'append': [tuple(t['to'])]}
    if k in ('haraka', 'letter', 'shadda', 'vowel_length'):
        x = t['at'][0]
        item['_right'] = ay(x['s'], x['a'])[x['w']]
        return {(x['s'], x['a']): ('slip', x['w'], item)}
    return None


def ayah_windows(res, words_obj, ayat, KEY, nframes):
    """Each ayah's frames in the take, from the words check's path (first word's start to last word's end)."""
    visits = {}
    for w in lit(res['words']):
        vs = w.get('visits') or []
        if vs:
            visits[w['word']] = (min(v['start'] for v in vs), max(v['end'] for v in vs))
    out = {}
    for s, a in ayat:
        n = len(KEY.uthmani(s, a))
        first = words_obj.first[words_obj.vindex[(s, a)]]
        got = [visits[w] for w in range(first, first + n) if w in visits]
        if got:
            f0 = max(0, int((got[0][0] - 0.3) * FPS)); f1 = min(nframes, int((got[-1][1] + 0.3) * FPS))
            if f1 - f0 > 10:
                out[(s, a)] = (f0, f1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', default=str(LAB / 'data/record-v1'))
    ap.add_argument('--run', default=str(LAB / 'runs/record-v1'))
    ap.add_argument('--words', default='rec.hisn.wp', help='checker.py results name for the words check')
    ap.add_argument('--v3', default=str(LAB / 'models/ft-v3/step8000.pt'))
    ap.add_argument('--items', default='', help='docs/record/items.json (default: the live copy)')
    args = ap.parse_args()
    bench_dir, run = pathlib.Path(args.bench), pathlib.Path(args.run)
    import record_bench, bench, hisn_torch
    items = {x['id']: x for x in record_bench.load_items(args.items)['items']}
    words_obj = bench.Words()
    checker._init(1)
    EAR, KEY = checker.EAR, checker.KEY
    letters_v2.EAR, letters_v2.KEY = EAR, KEY
    SL = tajweed.Slots(EAR)
    v3 = hisn_torch.Ear(args.v3, device='cpu', name='v3') if args.v3 and pathlib.Path(args.v3).exists() else None
    import soundfile as sf

    # bars set on professionals (bench-v0): letters (one bar, shadda checked by time) and tajweed margins
    lrows = json.load(open(LAB / 'runs/v0/letters_v2.hisn.json'))
    pro_words = [r[2][0] for r in lrows if r[0] == 'pro']
    held = [h for w in pro_words for m, why, h, *_ in w if why.startswith('no shadda') and h is not None]
    smax = float(np.percentile(held, 5))
    best = lambda w: max([m for m, why, h, *_ in w if letters_v2.kind_of(why) != 'length'
                          and not (why.startswith('no shadda') and (h is None or h > smax))] or [-1e9])
    lbar = float(np.quantile([best(w) for w in pro_words], 1 - 0.003))
    pros = json.load(open(LAB / 'runs/v0/pros_tajweed.json'))
    tbar = {k: float(np.quantile([r[3] for r in pros if r[2] == k and r[1] == 'clean'], 0.98))
            for k in ('Ghunnah', 'Ikhfa', 'Ikhfa meem', 'Qalqalah')}

    report, rows = [], []
    for jf in sorted((bench_dir / 'items').glob('*.json')):
        truth = json.loads(jf.read_text())
        iid, item_id = truth['id'], truth['passage']
        item = items[item_id]
        ayat = [(v['s'], v['a']) for v in item['ayat']] if not item.get('choose') else None
        if ayat is None:
            lo = truth['range'][0]; s, a0, _ = KEY.where(lo); s2, a1, _ = KEY.where(truth['range'][1] - 1)
            ayat = [(s, x) for x in range(a0, a1 + 1)]
        x, _ = sf.read(bench_dir / 'items' / f'{iid}.wav', dtype='float32')
        lp = EAR.logprobs(x)
        lp3 = v3.logprobs(x) if v3 else None
        resp = run / 'results' / args.words / f'{iid}.json'
        res = json.loads(resp.read_text()) if resp.exists() else None
        row = {'id': iid, 'item': item_id, 'kind': item['truth']['kind'], 'title': item['title'], 'secs': round(len(x) / 16000, 1)}

        # 1. did the take do what was asked? (whole take, as written vs with the asked change)
        change = asked_version(item, KEY)
        if change is not None:
            try:
                correct, asked = passage(KEY, ayat), passage(KEY, ayat, change)
                d = fit(lp, EAR.index, asked) - fit(lp, EAR.index, correct)
                d3 = (fit(lp3, v3.index, asked) - fit(lp3, v3.index, correct)) if v3 else None
                row['did_it'] = {'released': round(d, 1), 'v3': None if d3 is None else round(d3, 1)}
            except Exception as e:
                row['did_it'] = {'error': repr(e)[:120]}

        # 2. the words check
        if res is not None:
            flagged = {int(k): v for k, v in lit(res['flagged']).items()}
            extras = lit(res['extras'])
            ev = [e for e in truth['events'] if e.get('mistake')]
            planted = {w for e in ev for w in e.get('words', [])}
            if item['truth']['kind'] == 'ins':
                after = ev[0]['after']
                caught = any(abs(e['after'] - after) <= 1 for e in extras)
                fa = len(flagged) + len([e for e in extras if abs(e['after'] - after) > 1])
            elif item['truth']['kind'] in ('del', 'sub', 'skip_ayah', 'jump'):
                caught = bool(planted & set(flagged)) or (item['truth']['kind'] in ('skip_ayah', 'jump') and
                                                         any(lit(res['statuses']).get(str(w)) not in ('correct', None) for w in planted))
                fa = len([w for w in flagged if w not in planted]) + len(extras)
            else:
                caught = None
                fa = len([w for w in flagged if w not in planted]) + len(extras)
            row['words'] = {'caught': caught, 'false_alarms': fa, 'flags': [(w, v.get('kind'), v.get('heard')) for w, v in flagged.items()][:6],
                            'extras': len(extras)}

        # 3. letters and harakat: the planted word's slips
        if item['truth']['kind'] in ('haraka', 'letter', 'shadda', 'vowel_length') and res is not None:
            tw = item['truth']['at'][0]
            wins = ayah_windows(res, words_obj, ayat, KEY, lp.shape[0])
            if (tw['s'], tw['a']) in wins:
                f0, f1 = wins[(tw['s'], tw['a'])]
                judged = letters_v2.words_judge(lp[f0:f1], KEY.phonetize(KEY.uthmani(tw['s'], tw['a'])))
                w = judged[tw['w']] or []
                top = max(w, key=lambda r: r[0]) if w else None
                row['letters'] = {'caught': (best(w) > lbar) if w else False, 'top_slip': top[1] if top else None,
                                  'margin': round(top[0], 1) if top else None, 'bar': round(lbar, 1)}
            else:
                row['letters'] = {'caught': False, 'note': 'ayah not found in the take'}

        # 4. tajweed at the planted places (and the madd setting items)
        tk = item['truth']['kind']
        if tk in ('madd_setting', 'madd', 'ghunnah', 'ikhfa', 'iqlab', 'qalqalah', 'idgham') and res is not None:
            wins = ayah_windows(res, words_obj, ayat, KEY, lp.shape[0])
            kinds = {'madd_setting': ('Monfasel Madd',), 'madd': ('Lazem Madd',), 'ghunnah': ('Ghunnah',),
                     'ikhfa': ('Ikhfa',), 'iqlab': ('Ikhfa meem',), 'qalqalah': ('Qalqalah',), 'idgham': ()}[tk]
            got = []
            for s, a in sorted({(x['s'], x['a']) for x in item['truth'].get('at', [])}):
                if (s, a) not in wins:
                    got.append({'ayah': f'{s}:{a}', 'note': 'not found in the take'}); continue
                f0, f1 = wins[(s, a)]
                for j in tajweed.judge(lp[f0:f1], EAR, SL.ayah(s, a)):
                    if j['kind'] in kinds:
                        g = {'ayah': f'{s}:{a}', 'kind': j['kind'], 'margin': round(j['margin'], 1)}
                        if j.get('tcount') is not None:
                            g['count'] = round(j['tcount'], 1)
                        if j['kind'] in tbar:
                            g['flagged'] = j['margin'] > tbar[j['kind']]
                        if j.get('nasal_v'):
                            g['nasal_held'] = round(j['nasal_v'], 1)
                        got.append(g)
            row['tajweed'] = got or [{'note': 'the checker does not judge this rule yet' if not kinds else 'no place found'}]
        rows.append(row)
    out = run / 'record_check.json'
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    for r in rows:
        print(json.dumps(r, ensure_ascii=False))
    print(f'letters bar {lbar:.1f} (3 in 1,000 professional words); tajweed margin bars (2% of professionals): {tbar}')


if __name__ == '__main__':
    main()
