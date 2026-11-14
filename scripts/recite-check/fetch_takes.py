#!/usr/bin/env python3
"""Copy the recitations the Dev app kept as test data (revisely-dev Storage, recite-tests/<uid>/) to the lab.

Rules (Majd, Nov 2026): nobody listens to them, him included; they are judged by the lab's scripts only. They stay
on the Mac (never Modal, never git) and are held out of training, like the /record takes.

  python fetch_takes.py [--out ~/revisely-mistake-lab/data/dev-takes] [--list]

Each take is <time>-<id>.wav (16 kHz mono) and <time>-<id>.json (the request, the app's version and the service's
result; a live take's has "mode": "live", its events and its dismissals). Next to them: <take>.dismiss-<time>.json
(a "Not a mistake" after the fact) and <take>.part-<time>.wav/.json (a live take as far as it got when its connection
dropped; the full take has no .part). Needs gcloud signed in with access to revisely-dev. Copies only what isn't there.
"""
import argparse
import json
import pathlib
import subprocess

BUCKET = 'gs://revisely-dev.firebasestorage.app/recite-tests'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/dev-takes'))
    ap.add_argument('--list', action='store_true', help='only say what each take was and what the service found')
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    if not args.list:
        out.mkdir(parents=True, exist_ok=True)
        subprocess.run(['gcloud', 'storage', 'rsync', '--recursive', '--no-clobber', '--project', 'revisely-dev',
                        BUCKET, str(out)], check=True)
    takes = sorted(p for p in out.glob('*/*.json') if '.dismiss-' not in p.name and '.part-' not in p.name)
    dismissals = len(list(out.glob('*/*.dismiss-*.json')))
    total = 0.0
    for p in takes:
        m = json.loads(p.read_text())
        r, q = m.get('result') or {}, m.get('request', {})
        total += r.get('secs', 0)
        words = r.get('words', [])
        wrong = [w for w in words if w['status'] in ('wrong', 'missed')]
        print(f"{p.parent.name[:6]}…/{p.stem}  {m.get('mode', 'check')}  from {q.get('s')}:{q.get('a')}  "
              f"{r.get('secs')} s  {len(words)} words said, {len(wrong)} flagged, {len(r.get('extras', []))} extra, "
              f"{len(r.get('tajweed', []))} tajweed, {len(m.get('dismissed', []))} dismissed  "
              f"(engine {r.get('engine')}, app {m.get('app')})")
    print(f'{len(takes)} takes, {total / 60:.1f} minutes, {dismissals} dismissals after the fact, in {out}')


if __name__ == '__main__':
    main()
