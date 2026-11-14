#!/usr/bin/env python3
"""End-to-end run of /live: streams a recitation to the service at real time, as the phone does (100 ms PCM
chunks), and reports what came back and how fast. Public reciters' audio only (the lab's bench-v0 takes, which say
where each word is and what was planted); never anyone's own recordings.

  python live_e2e.py --token-file F --item ~/revisely-mistake-lab/data/bench-v0/items/alafasy.p2.m1.clean.json \\
      [--url wss://…/live] [--fast] [--drop-at 20] [--transcript out.json]

  --token-file  a Firebase ID token of a revisely-dev tester (the notes folder's recite-server-handover/dev-token.js
                writes one; it is never printed)
  --fast        send as fast as possible (no latencies; checks resume and the answer)
  --drop-at S   close the socket after S seconds of audio and resume on a new one, as a phone that lost signal

Latency of an event = when it arrived minus when the audio it is about was sent: `at` from the word's start, `said`
from the end of each word it covers, a mark from the end of its word (a skipped word: the end of the word after it).
"""
import argparse
import ast
import asyncio
import json
import pathlib
import statistics
import time
import wave

import websockets

URL = 'wss://recite-check-433792838929.us-east1.run.app/live'
SR = 16000


def load_item(path):
    t = json.loads(pathlib.Path(path).read_text())
    for k in ('timeline', 'labels', 'events', 'range'):
        if isinstance(t.get(k), str):
            t[k] = ast.literal_eval(t[k])
    with wave.open(str(pathlib.Path(path).with_suffix('.wav'))) as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (SR, 1, 2)
        pcm = w.readframes(w.getnframes())
    return t, pcm


def quantiles(xs):
    if not xs:
        return '-'
    xs = sorted(xs)
    return f"median {statistics.median(xs):.2f} s, p90 {xs[min(len(xs) - 1, int(0.9 * len(xs)))]:.2f} s, " \
           f"max {xs[-1]:.2f} s (n={len(xs)})"


async def session(url, token, start, pcm, fast, drop_at, chunk=3200):
    """Returns (events with their arrival time, wall time each sample position was sent, timings)."""
    events, sent_at = [], {}
    t_conn = time.perf_counter()
    stamps = {}
    pos, take = 0, None
    t0 = None
    rounds = 0
    while True:
        rounds += 1
        async with websockets.connect(url, max_size=2 ** 24, open_timeout=60) as ws:
            first = dict(start, token=token)
            if take:
                first['resume'] = take
            await ws.send(json.dumps(first))
            ready = json.loads(await ws.recv())
            if ready['type'] != 'ready':
                raise SystemExit(f'refused: {ready}')
            stamps.setdefault('ready', time.perf_counter() - t_conn)
            take = ready['take']
            if rounds > 1:
                stamps['resumed_from'] = ready['from']
                pos = ready['from'] * 2  # bytes: the service holds this much; send the rest

            async def reader():
                async for m in ws:
                    e = json.loads(m)
                    e['_at'] = time.perf_counter()
                    events.append(e)
                    if e['type'] in ('done', 'error'):
                        return

            rd = asyncio.create_task(reader())
            if t0 is None:
                t0 = time.perf_counter()
            dropped = False
            while pos < len(pcm):
                if drop_at and rounds == 1 and pos >= drop_at * SR * 2:
                    dropped = True
                    break
                if not fast:  # real time: chunk k goes out when its audio would have been recorded
                    due = t0 + (pos + chunk) / (2 * SR)
                    await asyncio.sleep(max(0.0, due - time.perf_counter()))
                await ws.send(pcm[pos:pos + chunk])
                pos += chunk
                sent_at[pos // 2] = time.perf_counter()
            if dropped:
                rd.cancel()
                await ws.close()
                continue
            stamps['audio_sent'] = time.perf_counter()
            await ws.send(json.dumps({'type': 'end'}))
            await asyncio.wait_for(rd, 300)
            stamps['done'] = time.perf_counter() - stamps['audio_sent']
            return events, sent_at, stamps, rounds


def when_sent(sent_at, seconds):
    """Wall time the sample at `seconds` into the take had been sent."""
    p = int(seconds * SR)
    keys = sorted(sent_at)
    for k in keys:
        if k >= p:
            return sent_at[k]
    return sent_at[keys[-1]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default=URL)
    ap.add_argument('--token-file', required=True)
    ap.add_argument('--item', required=True)
    ap.add_argument('--fast', action='store_true')
    ap.add_argument('--drop-at', type=float, default=0)
    ap.add_argument('--letters', action='store_true')
    ap.add_argument('--no-tajweed', action='store_true', help='the "words and harakat" level (tajweed off)')
    ap.add_argument('--follow', action='store_true', help='Recite: the cursor and said only')
    ap.add_argument('--transcript')
    args = ap.parse_args()
    token = pathlib.Path(args.token_file).expanduser().read_text().strip()
    truth, pcm = load_item(args.item)
    start = {'type': 'start', 's': truth['sura'], 'a': truth['ayat'][0], 's2': truth['sura'], 'a2': truth['ayat'][1],
             'mon': 4, 'mot': 4, 'aar': 0, 'letters': args.letters, 'tajweed': not args.no_tajweed,
             'follow': args.follow, 'keep': False, 'app': 'live_e2e'}
    events, sent_at, stamps, rounds = asyncio.run(session(args.url, token, start, pcm, args.fast, args.drop_at))

    tl = {e['word']: e for e in truth['timeline'] if e.get('word') is not None and not e.get('extra')}
    planted = [(e.get('type'), e.get('words')) for e in truth['events']]
    done = next((e for e in events if e['type'] == 'done'), None)
    errors = [e for e in events if e['type'] == 'error']
    print(f"{truth['id']}: {len(pcm) / 2 / SR:.1f} s of audio, {truth['sura']}:{truth['ayat'][0]}-{truth['ayat'][1]}, "
          f"{'fast' if args.fast else 'real time'}, {rounds} socket(s)")
    print(f"  connect -> ready {stamps['ready']:.2f} s; end -> done {stamps.get('done', float('nan')):.2f} s"
          + (f"; resumed from sample {stamps['resumed_from']}" if 'resumed_from' in stamps else ''))
    print('  events:', {k: sum(1 for e in events if e['type'] == k)
                        for k in ('at', 'said', 'mark', 'unmark', 'ayah', 'score', 'done', 'error')})
    if errors:
        print('  ERRORS:', errors)
    print('  planted:', planted)
    live_marks = [e['mark'] for e in events if e['type'] == 'mark']
    print('  live marks:', [m['id'] for m in live_marks])
    print('  unmarks:', [e['id'] for e in events if e['type'] == 'unmark'])
    if done:
        r = done['result']
        if r.get('follow'):  # Recite: words and statuses only
            print('  done (recite):', len(r['words']), 'words,', sum(1 for w in r['words'] if w['status'] != 'correct'),
                  'not correct; ms:', r.get('ms'))
        else:
            print('  done marks:', [m['id'] for m in r['marks']])
            print('  done score:', r['score'], 'ms:', r.get('ms'))
    if not args.fast and rounds == 1:
        lat_at, lat_said, lat_mark = [], [], []
        seen_at = set()
        prev = None
        for e in events:
            if e['type'] == 'at' and e['w'] in tl and e['w'] not in seen_at:
                seen_at.add(e['w'])
                lat_at.append(e['_at'] - when_sent(sent_at, tl[e['w']]['start']))
            elif e['type'] == 'said':
                lo = (prev + 1) if prev is not None else min(tl)
                for w in range(lo, e['upTo'] + 1):
                    if w in tl:
                        lat_said.append(e['_at'] - when_sent(sent_at, tl[w]['end']))
                prev = e['upTo']
            elif e['type'] == 'mark' and e['mark']['kind'] != 'tajweed':
                w = e['mark']['w']
                ref = tl.get(w) or tl.get(min((x for x in tl if x > w), default=w))
                if ref:
                    lat_mark.append(e['_at'] - when_sent(sent_at, ref['end']))
        print('  latency, word start -> its `at`:   ', quantiles(lat_at))
        print('  latency, word end -> its `said`:   ', quantiles(lat_said))
        print('  latency, word end -> its mark:     ', quantiles(lat_mark))
    if args.transcript:
        t_first = events[0]['_at'] if events else 0
        out = [dict({k: v for k, v in e.items() if k != '_at'}, arrived=round(e['_at'] - t_first, 2)) for e in events]
        pathlib.Path(args.transcript).write_text(json.dumps({'item': truth['id'], 'start': start | {'token': '…'},
                                                             'planted': planted, 'events': out},
                                                            ensure_ascii=False, indent=1))
        print('  transcript ->', args.transcript)


if __name__ == '__main__':
    main()
