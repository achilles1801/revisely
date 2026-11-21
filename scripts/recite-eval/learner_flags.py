import json, os, pathlib, collections, sys
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
name = sys.argv[1]
R = LAB / 'runs/v0/results' / name
why = collections.Counter(); subs = collections.Counter(); kinds = collections.Counter()
n_ok = n_ok_flag = 0; n_bad = n_bad_flag = 0
per_rec_why = collections.Counter()
for f in sorted((LAB / 'data/learners-v0/items').glob('*.json')):
    t = json.loads(f.read_text())
    rp = R / f"{t['id']}.json"
    if not rp.exists():
        continue
    r = json.loads(rp.read_text())
    flagged = r['flagged']
    good = t['variant'] == 'learner-correct'
    if good:
        n_ok += 1; n_ok_flag += bool(flagged)
        ws = set()
        for w, x in flagged.items():
            kinds[x['kind']] += 1
            for y in x.get('why', []) or [x['kind']]:
                why[y] += 1; ws.add(y)
            for e, h, p in x.get('subs', []):
                subs[(e, h)] += 1
        for y in ws:
            per_rec_why[y] += 1
    else:
        n_bad += 1; n_bad_flag += bool(flagged)
print(name, f'correct flagged {n_ok_flag}/{n_ok} = {100*n_ok_flag/n_ok:.1f}%; incorrect flagged {n_bad_flag}/{n_bad} = {100*n_bad_flag/n_bad:.1f}%')
print('kinds', kinds.most_common())
print('why (words)', why.most_common())
print('why (recordings)', per_rec_why.most_common())
print('subs', subs.most_common(25))
