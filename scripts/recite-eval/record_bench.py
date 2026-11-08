#!/usr/bin/env python3
"""Bench v1: volunteers' recordings from revisely.app/record, as a bench the checker and score.py read.

The recordings are downloaded first from the owner's private Drive folder "Revisely recordings (private)"
into a local folder (one sub-folder per code: P01/, P02/ …, each with consent.json, profile.json and
<item>_take<n>.m4a/.webm). Only folders with a consent.json are used, and only the latest take of each item.
Nothing here leaves the Mac; the bench goes to --out (the lab), never into the repository.

Each item's truth comes from the page's own script (docs/record/items.json, or the live copy):
  - normal items, slips (going back, a pause, a repeated ayah) and other places: every word ok;
  - word mistakes: del, sub, ins, askip (an ayah left out), mut (carried on into Luqman 6 instead of
    Al-Baqarah 6, so Al-Baqarah 6 is expected and its words count as the mistake);
  - letter and haraka mistakes: type 'letter' (mode 2, letters), on the word changed;
  - tajweed changes: type 'tajweed' (mode 3), not a mode 2 mistake and not counted as a false alarm either;
  - the passage of the volunteer's choice (n8): ok, using the surah and ayat they picked.
There are no word timings, so score.py's lag and latency don't apply to these items; false alarms and
mistakes caught do. Whether a volunteer made the mistake asked for is not checked here: listen to the
flagged and the missed ones before trusting a number.

  python record_bench.py --recordings DIR --out DIR [--items docs/record/items.json]
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bench  # noqa: E402  (the app's word numbering)

WORD_TYPES = {'del': 'del', 'sub': 'sub', 'ins': 'ins', 'skip_ayah': 'askip', 'jump': 'mut'}
LETTER = {'haraka', 'letter', 'shadda', 'vowel_length'}
TAJWEED = {'madd', 'ghunnah', 'ikhfa', 'iqlab', 'qalqalah', 'idgham'}


def load_items(path):
    if path:
        return json.loads(pathlib.Path(path).read_text(encoding='utf8'))
    with urllib.request.urlopen('https://revisely.app/record/items.json') as r:
        return json.loads(r.read().decode('utf8'))


def app_word(words, s, a, w=0):
    return words.first[words.vindex[(s, a)]] + w


def truth_for(item, words, choice=None):
    """(range lo, hi, labels, events) in the app's word numbers."""
    if item.get('choose'):
        s, a1, a2 = choice['s'], choice['a1'], choice['a2']
        ayat = [(s, a) for a in range(a1, a2 + 1)]
    else:
        ayat = [(v['s'], v['a']) for v in item['ayat']]
    t = item['truth']
    if t['kind'] == 'jump':  # expected: the passage, then the ayah they were asked not to say
        s, a = t['after']
        ayat = ayat + [(s, a + 1)]
    lo = app_word(words, *ayat[0])
    last = ayat[-1]
    hi = app_word(words, *last) + words.counts[words.vindex[last]]
    labels = {w: {'label': 'ok', 'start': 0.0, 'end': 0.0} for w in range(lo, hi)}
    events = []
    kind = t['kind']

    def at_words(key='at'):
        return [app_word(words, x['s'], x['a'], x['w']) for x in t.get(key) or []]

    if kind in WORD_TYPES:
        typ = WORD_TYPES[kind]
        if kind == 'ins':
            after = app_word(words, t['after']['s'], t['after']['a'], t['after']['w'])
            events.append({'type': 'ins', 'after': after, 'words': [], 'mistake': True})
        elif kind == 'skip_ayah':
            s, a = t['ayah']
            ws = list(range(app_word(words, s, a), app_word(words, s, a) + words.counts[words.vindex[(s, a)]]))
            events.append({'type': typ, 'words': ws, 'mistake': True})
            for w in ws:
                labels[w]['label'] = 'askip'
        elif kind == 'jump':
            s, a = t['after']
            ws = list(range(app_word(words, s, a + 1), hi))
            events.append({'type': typ, 'words': ws, 'mistake': True})
            for w in ws:
                labels[w]['label'] = 'mut'
        else:
            ws = at_words()
            events.append({'type': typ, 'words': ws, 'mistake': True})
            for w in ws:
                labels[w]['label'] = typ
    elif kind in LETTER:
        ws = at_words()
        events.append({'type': 'letter', 'sub': kind, 'words': ws, 'mistake': True})
        for w in ws:
            labels[w]['label'] = 'letter'
    elif kind in TAJWEED:
        ws = at_words()
        events.append({'type': 'tajweed', 'sub': kind, 'words': ws, 'mistake': False})
        for w in ws:
            labels[w]['label'] = 'tajweed'
    else:  # correct, back, pause, repeat, madd_setting: nothing is a mistake
        events.append({'type': kind, 'words': [], 'mistake': False})
    return lo, hi, labels, events


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--recordings', required=True, help='local copy of "Revisely recordings (private)"')
    ap.add_argument('--out', required=True)
    ap.add_argument('--items', default='', help='docs/record/items.json (default: the live copy)')
    args = ap.parse_args()
    items = {x['id']: x for x in load_items(args.items)['items']}
    words = bench.Words()
    out = pathlib.Path(args.out)
    (out / 'items').mkdir(parents=True, exist_ok=True)
    index, skipped = [], 0
    for folder in sorted(pathlib.Path(args.recordings).glob('P*')):
        if not (folder / 'consent.json').exists():
            skipped += 1
            continue
        profile = {}
        if (folder / 'profile.json').exists():
            profile = json.loads((folder / 'profile.json').read_text()).get('profile', {})
        takes = {}
        for f in folder.iterdir():
            m = re.match(r'^([a-z][a-z0-9]*)_take(\d+)\.(m4a|webm|ogg|aac)$', f.name)
            if m and m.group(1) in items:
                if int(m.group(2)) > takes.get(m.group(1), (0, None))[0]:
                    takes[m.group(1)] = (int(m.group(2)), f)
        for item_id, (take, f) in sorted(takes.items()):
            item = items[item_id]
            meta_path = f.with_suffix(f.suffix + '.json')  # the mock server's sidecar; Drive keeps it in the description
            choice = json.loads(meta_path.read_text()).get('choice') if meta_path.exists() else None
            if item.get('choose') and not choice:
                continue
            lo, hi, labels, events = truth_for(item, words, choice)
            iid = f'{folder.name}.{item_id}'
            wav = out / 'items' / f'{iid}.wav'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(f), '-ac', '1', '-ar', '16000', str(wav)],
                           check=True)
            dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of',
                                        'default=nw=1:nk=1', str(wav)], capture_output=True, text=True).stdout or 0)
            cond = (item['truth'].get('condition') or 'phone') if item['group'] == 'place' else 'phone'
            variant = 'clean' if not any(e.get('mistake') for e in events) else 'm1'
            truth = {
                'id': iid, 'reciter': folder.name, 'passage': item_id, 'variant': variant, 'condition': cond,
                'group': item['group'], 'duration': dur, 'range': [lo, hi], 'start_at': lo, 'stop_at': hi,
                'events': events, 'labels': {str(k): v for k, v in labels.items()}, 'timeline': [],
                'profile': profile, 'take': take,
            }
            (out / 'items' / f'{iid}.json').write_text(json.dumps(truth, ensure_ascii=False))
            index.append({'id': iid, 'reciter': folder.name, 'item': item_id, 'group': item['group'],
                          'duration': dur})
    (out / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=1))
    print(f'{len(index)} recordings from {len({x["reciter"] for x in index})} people '
          f'({sum(x["duration"] for x in index) / 3600:.2f} h); {skipped} folders without consent skipped')


if __name__ == '__main__':
    main()
