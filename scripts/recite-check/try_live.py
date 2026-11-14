"""Stream a WAV through engine.LiveSession in 100 ms chunks, as the phone would: the events, the timing and the final
answer. Run from scripts/recite-check with LAB and RECITE_HARNESS set as for the server (stage.sh), for example:

  LAB=/tmp/recite-stage/lab RECITE_HARNESS=/tmp/recite-stage/harness/scripts/recite-eval \
    python try_live.py take.wav S A S2 A2 [LETTERS 0|1] [events.json]
"""
import json, sys, time, collections
import soundfile as sf
sys.path.insert(0, '.')
import engine

e = engine.Engine(threads=2)
wav, s, a, s2, a2 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
letters = sys.argv[6] if len(sys.argv) > 6 else '0'
x, sr = sf.read(wav, dtype='int16')
L = engine.LiveSession(e, s, a, s2, a2, {'letters': letters})
evs, t0, worst = [], time.perf_counter(), 0.0
for i in range(0, len(x), 1600):
    c0 = time.perf_counter()
    for ev in L.feed(x[i:i + 1600]):
        ev['_at'] = round((i + 1600) / 16000, 2)
        evs.append(ev)
    worst = max(worst, time.perf_counter() - c0)
live_s = time.perf_counter() - t0
t1 = time.perf_counter()
done = L.end()
import resource
print(f'audio {len(x)/16000:.1f} s, live compute {live_s:.1f} s, worst chunk {worst*1000:.0f} ms, end {time.perf_counter()-t1:.1f} s, '
      f'segments {len(L.segs)}, peak memory {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20:.0f} MB')
print('events', dict(collections.Counter(ev['type'] for ev in evs)))
for ev in evs:
    if ev['type'] in ('mark', 'unmark'):
        print(' ', ev['_at'], json.dumps({k: v for k, v in ev.items() if k != '_at'}, ensure_ascii=False)[:170])
print('live score', [ev for ev in evs if ev['type'] == 'score'][-1:] )
print('final score', done['score'], 'final marks', collections.Counter((m['kind'], m['sure']) for m in done['marks']))
json.dump(evs, open(sys.argv[7] if len(sys.argv) > 7 else '/dev/null', 'w'), ensure_ascii=False)
