"""Cut a public bench take so it starts at ayah S:A (0.3 s before its first word): a take that starts mid-page.
Writes OUT/<id>.from<S>-<A>.wav/.json with the timeline shifted and the planted events after the cut kept.
  python cut_take.py OUT ITEM.json S:A [S:A ...]     (run from a staged folder, LAB/RECITE_HARNESS set)"""
import ast, json, pathlib, sys, wave
import engine
E = engine.Engine(threads=1)
out, item = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
t = json.loads(item.read_text())
for k in ('timeline', 'events', 'range', 'labels'):
    if isinstance(t.get(k), str):
        t[k] = ast.literal_eval(t[k])
with wave.open(str(item.with_suffix('.wav'))) as w:
    pcm = w.readframes(w.getnframes())
for sa in sys.argv[3:]:
    s, a = map(int, sa.split(':'))
    w0 = E.passage(s, a, s, a)[0]
    first = next(e for e in t['timeline'] if e.get('word') == w0 and not e.get('extra'))
    cut = max(0.0, first['start'] - 0.3)
    n = int(cut * 16000) * 2
    c = dict(t, id=f"{t['id']}.from{s}-{a}", ayat=[a, t['ayat'][1]], range=[w0, t['range'][1]], cut=round(cut, 3),
             duration=round((len(pcm) - n) / 32000, 2),
             timeline=[dict(e, start=round(e['start'] - cut, 3), end=round(e['end'] - cut, 3))
                       for e in t['timeline'] if e['start'] >= cut - 0.05],
             events=[e for e in t['events'] if min([v for k, v in e.items() if k in ('from', 'after', 'to') and isinstance(v, int)] or [w0]) >= w0])
    with wave.open(str(out / (c['id'] + '.wav')), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(pcm[n:])
    (out / (c['id'] + '.json')).write_text(json.dumps(c, ensure_ascii=False))
    print(c['id'], 'cut at', c['cut'], 's, first word', w0, first['text'], 'events', len(c['events']), 'of', len(t['events']))
