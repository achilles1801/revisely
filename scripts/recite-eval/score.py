#!/usr/bin/env python3
"""Score replay results against the benchmark's ground truth.

  python score.py --bench DIR --run DIR --results NAME[,NAME...] [--json OUT] [--by condition,variant]

What is measured (words are the mushaf words of each item's passage):

Follow (mode 1)
  coverage        share of the words said that the app reached (any status but pending)
  lag             first shown (a partial or final heard it) minus the end of the word, seconds
  early           words shown more than 0.3 s before the reciter began them (a hidden word revealed early)

False alarms (the number that matters most)
  fa / 100 words  correct words flagged wrong or missed and still flagged at the end, per 100 words
  fa-ever         flagged at any time, including flags later cleared by a repeat
  clean passes    clean recordings (no mistakes in them) with no false alarm at all
  Words within one word of a planted mistake are left out of the false-alarm count: a flag there
  is the mistake found a word off, which is counted as "near" in detection instead.

Detection (mode 2, memorization mistakes; one count per planted mistake)
  strict          del/sub: that word flagged; swap: either word; askip/mut: at least half the words
  near            a flag on the mistake's words or within one word of them
  ins             an extra word: caught when the engine reports one after that word (res['extras']); the
                  app's tracker has no way to report extra words, so for it this is always missed
  latency         when the flag appeared minus when the mistake happened, seconds
  precision       flagged words that are on or next to a real mistake, of all flagged words
"""
import argparse
import collections
import json
import pathlib
import statistics

MISTAKES = {'del', 'sub', 'ins', 'swap', 'askip', 'mut'}
BAD = {'wrong', 'missed'}


def pct(a, b):
    return 100.0 * a / b if b else float('nan')


def q(xs, p):
    if not xs:
        return float('nan')
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def score_item(truth, res):
    lo, hi = truth['range']
    labels = {int(k): v for k, v in truth['labels'].items()}
    status = {int(k): v for k, v in res['statuses'].items()}
    shown = {int(k): v for k, v in res['shown'].items()}
    flagged = {int(k): v for k, v in res['flagged'].items()}
    events = truth['events']

    near = set()
    for ev in events:
        if not ev.get('mistake'):
            continue
        ws = ev.get('words') or []
        if ev['type'] == 'ins' and ev.get('after') is not None:
            ws = [ev['after'], ev['after'] + 1]
        for w in ws:
            near.update({w - 1, w, w + 1})
    ok = [w for w in range(lo, hi) if labels[w]['label'] in ('ok',) and w not in near]
    said = [w for w in range(lo, hi) if labels[w]['label'] in ('ok', 'swap')]

    out = collections.Counter()
    lags = []
    out['words_ok'] = len(ok)
    out['fa_final'] = sum(1 for w in ok if status.get(w) in BAD)
    out['fa_ever'] = sum(1 for w in ok if w in flagged)
    out['fa_outside'] = res.get('flaggedOutside', 0)
    out['said'] = len(said)
    out['reached'] = sum(1 for w in said if status.get(w) != 'pending')
    for w in ok:
        if w in shown:
            lags.append(shown[w] - labels[w]['end'])
            if shown[w] < labels[w]['start'] - 0.3:
                out['early'] += 1

    det = []
    for ev in events:
        if not ev.get('mistake'):
            continue
        ws = ev.get('words') or []
        t_event = None
        if ev['type'] == 'ins':
            # engines that report extra words give res['extras'] = [{'after': word, 't': seconds}]
            ex = [x for x in res.get('extras', []) if abs(int(x['after']) - ev['after']) <= 1]
            hit_s = any(int(x['after']) == ev['after'] for x in ex)
            hit_n = bool(ex)
            t_event = labels.get(ev['after'], {}).get('end')
            if ex and t_event is not None:
                det.append(('lat', min(x['t'] for x in ex) - t_event))
        else:
            fl = [w for w in ws if w in flagged]
            around = set()
            for w in ws:
                around.update({w - 1, w, w + 1})
            fl_near = [w for w in around if w in flagged]
            if ev['type'] in ('askip', 'mut'):
                hit_s = len(fl) * 2 >= len(ws)
            else:
                hit_s = len(fl) > 0
            hit_n = len(fl_near) > 0
            t_event = min(labels[w]['start'] for w in ws)
            if fl_near:
                det.append(('lat', min(flagged[w]['t'] for w in fl_near) - t_event))
        det.append((ev['type'], hit_s, hit_n))

    # precision: flagged words in the passage on or next to a real mistake
    mistake_zone = set()
    for ev in events:
        if not ev.get('mistake'):
            continue
        ws = ev.get('words') or []
        if ev['type'] == 'ins' and ev.get('after') is not None:
            ws = [ev['after'], ev['after'] + 1]
        for w in ws:
            mistake_zone.update({w - 1, w, w + 1})
    in_passage = [w for w in flagged if lo <= w < hi]
    out['flags'] = len(in_passage) + res.get('flaggedOutside', 0)
    out['flags_true'] = sum(1 for w in in_passage if w in mistake_zone)
    return out, lags, det


def aggregate(rows):
    tot = collections.Counter()
    lags = []
    det = collections.defaultdict(lambda: [0, 0, 0])
    lat = []
    clean_items = clean_pass = 0
    learner = collections.Counter()
    for truth, res in rows:
        if truth['variant'].startswith('learner'):
            lo, hi = truth['range']
            n_flags = sum(1 for w in res['flagged'] if lo <= int(w) < hi) + res.get('flaggedOutside', 0)
            learner[truth['variant']] += 1
            learner[truth['variant'] + ':flagged'] += n_flags > 0
            reached = sum(1 for w in range(lo, hi) if res['statuses'].get(str(w), 'pending') != 'pending')
            learner[truth['variant'] + ':words'] += hi - lo
            learner[truth['variant'] + ':reached'] += reached
        c, l, d = score_item(truth, res)
        tot.update(c)
        lags += l
        for x in d:
            if x[0] == 'lat':
                lat.append(x[1])
            else:
                kind, s, n = x
                det[kind][0] += 1
                det[kind][1] += s
                det[kind][2] += n
        if truth['variant'] == 'clean':
            clean_items += 1
            clean_pass += (c['fa_final'] + c['fa_outside']) == 0
    m = {
        'items': len(rows),
        'audio_h': round(sum(t['duration'] for t, _ in rows) / 3600, 2),
        'fa_per_100': round(pct(tot['fa_final'] + tot['fa_outside'], tot['words_ok']), 2),
        'fa_ever_per_100': round(pct(tot['fa_ever'] + tot['fa_outside'], tot['words_ok']), 2),
        'clean_pass': f'{clean_pass}/{clean_items}' if clean_items else '',
        'coverage': round(pct(tot['reached'], tot['said']), 1),
        'lag_median_s': round(q(lags, 0.5), 2),
        'lag_p90_s': round(q(lags, 0.9), 2),
        'early_per_100': round(pct(tot['early'], tot['words_ok']), 2),
        'precision': round(pct(tot['flags_true'], tot['flags']), 1) if tot['flags'] else float('nan'),
        'flags': tot['flags'],
        'words_ok': tot['words_ok'],
    }
    for v in ('learner-correct', 'learner-incorrect'):
        if learner[v]:
            m[v + ' flagged'] = f"{learner[v + ':flagged']}/{learner[v]} ({pct(learner[v + ':flagged'], learner[v]):.1f}%)"
            m[v + ' reached'] = round(pct(learner[v + ':reached'], learner[v + ':words']), 1)
    n_all = sum(v[0] for v in det.values())
    n_noins = sum(v[0] for k, v in det.items() if k != 'ins')
    if n_all:
        m['recall_strict'] = round(pct(sum(v[1] for v in det.values()), n_all), 1)
        m['recall_near'] = round(pct(sum(v[2] for v in det.values()), n_all), 1)
        m['recall_strict_no_ins'] = round(pct(sum(v[1] for k, v in det.items() if k != 'ins'), n_noins), 1)
        m['recall_near_no_ins'] = round(pct(sum(v[2] for k, v in det.items() if k != 'ins'), n_noins), 1)
        m['by_type'] = {k: {'n': v[0], 'strict': round(pct(v[1], v[0]), 1), 'near': round(pct(v[2], v[0]), 1)}
                        for k, v in sorted(det.items())}
        m['latency_median_s'] = round(q(lat, 0.5), 2)
        m['latency_p90_s'] = round(q(lat, 0.9), 2)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', required=True)
    ap.add_argument('--run', required=True)
    ap.add_argument('--results', required=True, help='comma-separated result names')
    ap.add_argument('--by', default='condition,variant')
    ap.add_argument('--json')
    args = ap.parse_args()
    bench = pathlib.Path(args.bench)
    run = pathlib.Path(args.run)
    keys = [k for k in args.by.split(',') if k]
    report = {}
    for name in args.results.split(','):
        rows = collections.defaultdict(list)
        for f in sorted((run / 'results' / name).glob('*.json')):
            res = json.loads(f.read_text())
            truth = json.loads((bench / 'items' / f.name).read_text())
            group = tuple(truth[k] for k in keys)
            rows[group].append((truth, res))
            if len(keys) > 1:
                rows[(group[0],) + ('all',) * (len(keys) - 1)].append((truth, res))
            rows[('all',) * len(keys)].append((truth, res))
        report[name] = {'/'.join(g): aggregate(r) for g, r in sorted(rows.items())}
        print(f'\n== {name}')
        cols = ['items', 'audio_h', 'fa_per_100', 'fa_ever_per_100', 'clean_pass', 'coverage', 'lag_median_s',
                'lag_p90_s', 'early_per_100', 'recall_strict_no_ins', 'recall_near_no_ins', 'recall_strict',
                'precision', 'latency_median_s']
        print('group'.ljust(22) + ''.join(c[:12].rjust(13) for c in cols))
        for g, m in report[name].items():
            print(g.ljust(22) + ''.join(str(m.get(c, '')).rjust(13) for c in cols))
        for g, m in report[name].items():
            extra = {k: v for k, v in m.items() if k.startswith('learner')}
            if extra:
                print('  ' + g + ': ' + ', '.join(f'{k} {v}' for k, v in extra.items()))
        allm = report[name]['/'.join(('all',) * len(keys))]
        if 'by_type' in allm:
            print('  by type (all):', ', '.join(f"{k} {v['strict']}/{v['near']} (n={v['n']})"
                                                for k, v in allm['by_type'].items()))
    if args.json:
        pathlib.Path(args.json).write_text(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
