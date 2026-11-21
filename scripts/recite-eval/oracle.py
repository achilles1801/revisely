#!/usr/bin/env python3
"""Perfect hearing: for every clip, the words actually in it (from the benchmark's timeline), as if speech
recognition made no errors. Replaying the tracker on these shows what the tracker itself gets wrong, apart
from the model. Written as an engine, <run>/transcripts/oracle-<tag>.jsonl, decode time 0.

Clip times are worked out from the segmenter's events: a partial ends when it is emitted and a final
0.2 s before (0.7 s of silence ends it, 0.5 s of it is kept); an utterance starts where its first
partial's audio starts. A word is in a clip when its middle is.

  python oracle.py --bench DIR --run DIR [--tag develop]
"""
import argparse
import json
import pathlib


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', required=True)
    ap.add_argument('--run', required=True)
    ap.add_argument('--tag', default='develop')
    args = ap.parse_args()
    bench = pathlib.Path(args.bench)
    run = pathlib.Path(args.run)
    out = run / 'transcripts' / f'oracle-{args.tag}.jsonl'
    rows = {}
    if out.exists():  # keep clips of other benches in the same run
        for line in out.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                rows[r['clip']] = r
    for f in sorted((run / 'segments' / args.tag).glob('*.json')):
        truth_path = bench / 'items' / f.name
        if not truth_path.exists():
            continue
        truth = json.loads(truth_path.read_text())
        timeline = truth['timeline']
        seg = json.loads(f.read_text())
        start_of = {}
        for e in seg['events']:
            if e['type'] == 'partial' and e['id'] not in start_of:
                start_of[e['id']] = e['t'] - e['seconds']
        for e in seg['events']:
            if e['type'] not in ('partial', 'final'):
                continue
            if e['type'] == 'partial':
                end = e['t']
                start = end - e['seconds']
            else:
                start = start_of.get(e['id'], e['t'] - 0.2 - e['seconds'])
                end = start + e['seconds']
            text = ' '.join(x['text'] for x in timeline if start <= (x['start'] + x['end']) / 2 <= end)
            rows[e['clip']] = {'clip': e['clip'], 'text': text, 'ms': 0, 'seconds': e['seconds']}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows.values()))
    print(f'{len(rows)} clips -> {out}')


if __name__ == '__main__':
    main()
