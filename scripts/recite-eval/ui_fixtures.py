"""Replay files for the app's live follow-along UI (recite-ui), in the server's live event format
(recite-contract.md in the sessions' notes folder), made from the lab's live checker runs on bench-v0.

Each file holds word numbers, times and what was planted. No audio, no voice: a fake feed for building the screens.
The timing is the live checker's own (checker --live: cursor from the first time a word is on the path, a word settled
when the live decision is made, a mark when it is flagged); `end` is the full check after stop.

  python ui_fixtures.py OUT_DIR ID [ID ...]       (results from runs/v0/results/live.wp.skel.d0.67)
"""
import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
import bench  # noqa: E402

RUN = LAB / 'runs/v0/results/live.wp.skel.d0.67'
ITEMS = LAB / 'data/bench-v0/items'
WORDS = bench.Words()
AYAH_OF = {v: k for k, v in WORDS.vindex.items()}


def ayah(w):
    lo, hi = 0, len(WORDS.first) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if WORDS.first[mid] <= w:
            lo = mid
        else:
            hi = mid - 1
    return list(AYAH_OF[lo])


KINDS = {'skipped': ('skipped', None), 'lookalike': ('word', 'lookalike'), 'sound': ('word', 'sound'),
         'replaced': ('word', 'replaced'), 'order': ('word', 'order'), 'extra': ('added', None),
         'trail': ('added', 'trail')}


def mark(w, checker_kind, t=None):
    kind, detail = KINDS[checker_kind]
    m = {'id': f'{w}:{kind}:{detail or ""}', 'w': w, 'ayah': ayah(w), 'kind': kind, 'sure': 'clear'}
    if detail:
        m['detail'] = detail
    if t:
        m['t'] = t
    return m


def build(item_id):
    truth = json.loads((ITEMS / f'{item_id}.json').read_text())
    res = json.loads((RUN / f'{item_id}.json').read_text())
    lo, hi = truth['range']
    ev = [{'t': 0.0, 'type': 'ready', 'v': 2, 'engine': 'lab-live', 'take': f'fixture-{item_id}'}]
    shown = sorted((t, int(w)) for w, t in res['shown'].items())
    decided = sorted((t, int(w)) for w, t in res['decided'].items())
    flagged = sorted((x['t'], int(w), x['kind']) for w, x in res['flagged'].items())
    first = min((w for _, w in shown), default=lo)
    cur = None
    for t, w in shown:
        if w != cur:
            ev.append({'t': round(t, 2), 'type': 'at', 'w': w})
            cur = w
    up = None
    for t, w in decided:
        if up is None or w > up:
            up = w
            ev.append({'t': round(t, 2), 'type': 'said', 'upTo': w, '_reached': w - first + 1})
    marked = []
    for t, w, kind in flagged:
        ev.append({'t': round(t, 2), 'type': 'mark', 'mark': mark(w, kind)})
        marked.append((t, w, kind))
    for e in res.get('extras') or []:
        w = int(e['after'])
        ev.append({'t': round(float(e['t']) + 1.5, 2), 'type': 'mark', 'mark': mark(w, 'trail' if e.get('trail') else 'extra')})
    ev.sort(key=lambda e: (e['t'], e['type'] != 'at'))
    # the score after each settled word or mark
    out, mistakes, reached = [], 0, 0
    for e in ev:
        out.append(e)
        if e['type'] == 'said':
            reached = e.pop('_reached')
        elif e['type'] == 'mark':
            mistakes += 1
        else:
            continue
        if reached:
            out.append({'t': e['t'], 'type': 'score', 'reached': reached, 'mistakes': mistakes, 'tajweed': 0,
                        'accuracy': round(max(0.0, 1 - mistakes / reached), 4)})
    stop = round(truth['duration'], 2)
    statuses = {int(w): s for w, s in res['statuses'].items()}
    for t, w, kind in marked:  # flags the full check didn't keep
        if statuses.get(w) not in ('wrong', 'missed'):
            out.append({'t': stop, 'type': 'unmark', 'id': mark(w, kind)['id'],
                        'why': 'corrected' if statuses.get(w) == 'corrected' else 'retracted'})
    final = [mark(w, kind) for t, w, kind in marked if statuses.get(w) in ('wrong', 'missed')]
    final += [mark(int(e['after']), 'trail' if e.get('trail') else 'extra') for e in res.get('extras') or []]
    said = [w for w, s in statuses.items() if s != 'pending']
    reach = (max(said) - first + 1) if said else 0
    out.append({'t': round(stop + 1.0, 2), 'type': 'done', 'result': {
        'v': 2, 'from': lo, 'to': hi, 'secs': stop, 'take': f'fixture-{item_id}',
        'marks': final,
        'words': [{'w': w, 'status': statuses[w]} for w in sorted(said)],
        'extras': [], 'tajweed': [], 'letters': None,
        'score': {'reached': reach, 'mistakes': len(final), 'tajweed': 0,
                  'accuracy': round(max(0.0, 1 - len(final) / reach), 4) if reach else 1.0},
    }})
    planted = [{k: e[k] for k in ('type', 'words', 'after', 'heard', 'ayah') if k in e} for e in truth['events']]
    return {
        'id': item_id,
        'note': 'Fake live feed for the UI, from the lab\'s live checker on a professional recitation with planted '
                'mistakes (bench-v0). Word numbers are the app\'s (QuranWords). No audio. `t` is seconds from start.',
        'passage': {'sura': truth['sura'], 'ayat': truth['ayat'], 'words': [lo, hi]},
        'start': {'type': 'start', 's': truth['sura'], 'a': truth['ayat'][0], 's2': None, 'a2': None, 'mon': 4,
                  'mot': 4, 'aar': 0, 'letters': False, 'keep': False},
        'planted': planted,
        'events': out,
    }


if __name__ == '__main__':
    dest = pathlib.Path(sys.argv[1])
    dest.mkdir(parents=True, exist_ok=True)
    for item in sys.argv[2:]:
        f = build(item)
        (dest / f'{item}.events.json').write_text(json.dumps(f, ensure_ascii=False, indent=1))
        n = {k: sum(1 for e in f['events'] if e['type'] == k) for k in ('at', 'said', 'mark', 'unmark', 'score')}
        print(item, n, 'final marks', len(f['events'][-1]['result']['marks']), 'planted',
              [p['type'] for p in f['planted']])
