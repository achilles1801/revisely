#!/usr/bin/env python3
"""Decode every clip the segmenter produced with a whisper.cpp model, as the app does (whisper.rn 0.7.4 =
whisper.cpp v1.9.3: greedy, temperature 0, no fallback, no context from earlier clips, timestamps on,
language ar, 4 threads). Results are cached per engine in <run>/transcripts/<engine>.jsonl as
{"clip", "text", "ms"}; ms is the decode time on this machine (the replay scales it for a phone).

  python decode_whisper.py --run DIR --engine NAME --model PATH [--tags develop,branch] [--server BIN]
"""
import argparse
import json
import pathlib
import socket
import subprocess
import sys
import time

import requests

LAB = pathlib.Path.home() / 'revisely-mistake-lab'


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--engine', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--tags', default='develop')
    ap.add_argument('--only', default='', help='only items whose name contains this')
    ap.add_argument('--bench', default='', help='only items of this bench (a run can hold several)')
    ap.add_argument('--finals-only', action='store_true', help='skip partial clips (for slow models)')
    ap.add_argument('--server', default=str(LAB / 'tools/whisper.cpp/build/bin/whisper-server'))
    ap.add_argument('--threads', default='4')
    ap.add_argument('--extra', default='', help='extra whisper-server arguments')
    args = ap.parse_args()

    run = pathlib.Path(args.run)
    out = run / 'transcripts' / f'{args.engine}.jsonl'
    out.parent.mkdir(parents=True, exist_ok=True)
    done = {}
    if out.exists():
        for line in out.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                done[r['clip']] = r
    wanted = []
    seen = set()
    for tag in args.tags.split(','):
        for f in sorted((run / 'segments' / tag).glob('*.json')):
            if args.only and args.only not in f.name:
                continue
            if args.bench and not (pathlib.Path(args.bench) / 'items' / f.name).exists():
                continue
            for e in json.loads(f.read_text())['events']:
                if e['type'] not in ('partial', 'final'):
                    continue
                if args.finals_only and e['type'] == 'partial':
                    continue
                if e['clip'] not in done and e['clip'] not in seen:
                    seen.add(e['clip'])
                    wanted.append((e['clip'], e['seconds']))
    total_audio = sum(s for _, s in wanted)
    print(f'{args.engine}: {len(done)} cached, {len(wanted)} to decode ({total_audio / 60:.1f} min of clips)',
          file=sys.stderr, flush=True)
    if not wanted:
        return

    port = free_port()
    cmd = [args.server, '-m', args.model, '-l', 'ar', '-t', args.threads, '-nf', '--host', '127.0.0.1',
           '--port', str(port)] + (args.extra.split() if args.extra else [])
    server = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=open(run / f'server-{args.engine}.log', 'w'))
    url = f'http://127.0.0.1:{port}/inference'
    try:
        for _ in range(240):
            try:
                requests.get(f'http://127.0.0.1:{port}/', timeout=1)
                break
            except requests.RequestException:
                if server.poll() is not None:
                    raise SystemExit(f'server exited: see {run}/server-{args.engine}.log')
                time.sleep(0.5)
        t0 = time.time()
        decoded_audio = 0.0
        with out.open('a') as fh:
            for n, (clip, seconds) in enumerate(wanted, 1):
                path = run / 'clips' / f'{clip}.wav'
                started = time.perf_counter()
                with path.open('rb') as f:
                    r = requests.post(url, files={'file': (path.name, f, 'audio/wav')},
                                      data={'temperature': '0', 'temperature_inc': '0',
                                            'response_format': 'verbose_json', 'language': 'ar'}, timeout=600)
                ms = (time.perf_counter() - started) * 1000
                r.raise_for_status()
                # whisper.rn joins segment texts as they are (the server's own text puts a newline
                # between them, which can split a word).
                body = r.json()
                segs = body.get('segments')
                text = ''.join(seg.get('text', '') for seg in segs) if segs is not None else body.get('text', '')
                text = text.strip()
                fh.write(json.dumps({'clip': clip, 'text': text, 'ms': round(ms, 1), 'seconds': seconds},
                                    ensure_ascii=False) + '\n')
                decoded_audio += seconds
                if n % 500 == 0:
                    el = time.time() - t0
                    print(f'  {n}/{len(wanted)} clips, {el / 60:.1f} min, RTF {el / decoded_audio:.3f}',
                          file=sys.stderr, flush=True)
        el = time.time() - t0
        print(f'{args.engine}: decoded {len(wanted)} clips in {el / 60:.1f} min (RTF {el / max(1e-9, decoded_audio):.3f})',
              file=sys.stderr, flush=True)
    finally:
        server.terminate()
        server.wait(timeout=30)


if __name__ == '__main__':
    main()
