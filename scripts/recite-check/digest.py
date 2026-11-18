#!/usr/bin/env python3
"""The recitation checker's weekly digest (Majd approved Nov 15 2026): its health lines (health.py) from Cloud Logging,
summed up as Markdown. Numbers only, as the lines are.

  python digest.py                 the last 7 days, printed
  python digest.py --days 30       another span
  python digest.py --post          also a comment on the "Recitation checker health" issue (label recite-health),
                                   made if missing (gh, signed in to this repository)
  python digest.py --file F.json   lines from a file (a JSON list of log entries) instead of Cloud Logging
  python digest.py --project revision-buddy-3a398   production's checker (once it exists), posted on its own issue

Reads revisely-dev's logs with `gcloud logging read` (logging.viewer is enough). README, "Health".
"""
import argparse
import datetime as dt
import json
import subprocess
import sys

PROJECT = 'revisely-dev'
PROD = 'revision-buddy-3a398'
SERVICES = ('recite-check', 'recite-check-pair')  # every level, one take an instance; Recite and Words & Harakat, two
REPO = 'achilles1801/revisely'
LABEL = 'recite-health'
TITLE = 'Recitation checker health (weekly digest)'
# Cloud Run, request-based billing, tier 1 (us-east1), and this service's size (README, "Deploying")
VCPU, GIB = 1, 2
PRICE_VCPU_S, PRICE_GIB_S = 0.000024, 0.0000025
FREE_VCPU_S, FREE_GIB_S = 180_000, 360_000  # a month, per billing account (shared with everything else on it)


def read_logs(days, project=PROJECT):
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%SZ')
    names = ' OR '.join(f'"{s}"' for s in SERVICES)
    q = (f'resource.type="cloud_run_revision" AND resource.labels.service_name=({names}) '
         f'AND jsonPayload.health:* AND timestamp>="{since}"')
    out = subprocess.run(['gcloud', 'logging', 'read', q, '--project', project, '--format', 'json', '--limit',
                          '100000'], check=True, capture_output=True, text=True).stdout
    return json.loads(out or '[]')


def lines(entries):
    """(kind, fields, revision, instance) of each health line. The fields carry `_pair` (the two-takes service),
    `_inst` (the instance) and `_end` (when the line was written, as a Unix time) for the instance time held."""
    for e in entries:
        p = e.get('jsonPayload') or {}
        if 'health' in p:
            res = (e.get('resource') or {}).get('labels', {})
            inst = (e.get('labels') or {}).get('instanceId')
            end = None
            if isinstance(e.get('timestamp'), str):
                end = dt.datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')).timestamp()
            yield (p['health'], dict(p, _pair=str(res.get('service_name', '')).endswith('-pair'), _inst=inst, _end=end),
                   res.get('revision_name'), inst)


def held_seconds(takes, drops):
    """Instance time a request held: per instance, the union of the spans of its takes and dropped sessions (two
    takes at once on the pair service count once). A line without a time or an instance counts its own length."""
    spans, loose = {}, 0.0
    # a drop's open_s runs on while it waits for its phone (RESUME_TTL) after the socket closed: its audio instead
    for p in [dict(x, _n=x.get('open_s', x.get('wall_s', 0))) for x in takes] + [dict(x, _n=x.get('audio_s', 0))
                                                                                for x in drops]:
        n = p['_n'] or 0
        if p.get('_inst') and p.get('_end'):
            spans.setdefault(p['_inst'], []).append((p['_end'] - n, p['_end']))
        else:
            loose += n
    total = loose
    for iv in spans.values():
        iv.sort()
        a, b = iv[0]
        for x, y in iv[1:]:
            if x > b:
                total += b - a
                a, b = x, y
            else:
                b = max(b, y)
        total += b - a
    return total


def q(xs, p):
    """The p-quantile (0–1) of xs, or None."""
    xs = sorted(x for x in xs if isinstance(x, (int, float)))
    return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else None


def f(x, unit='', nd=2):
    return '–' if x is None else f'{x:.{nd}f}{unit}'


def stop_to_done(live):
    """The summary's wait after Stop (`done_s`), for the takes that mark mistakes (Recite's is the words alone), and
    with namesAfter how long the names came after it (`names_after_ms`)."""
    marked = [p.get('done_s') for p in live if p.get('level') != 'recite' and p.get('done_s') is not None]
    names = [p.get('names_after_ms') / 1000 for p in live if p.get('names_after_ms') is not None]
    line = (f"- Stop → the summary (`done`), Mark mistakes: median {f(q(marked, .5), ' s')}, p90 {f(q(marked, .9), ' s')}, "
            f"worst {f(q(marked, 1), ' s')} ({len(marked)} takes)")
    if names:
        line += (f"; the names after it (namesAfter, {len(names)} takes): median {f(q(names, .5), ' s')}, "
                 f"worst {f(q(names, 1), ' s')}")
    return line + '.'


def premium_check(live):
    """Connect → `ready` for the takes that mark mistakes (`ready_s`), and how much of it was the Premium check
    (`gate_ms`: a read of entitlements, from production's Firestore in nam5, or the cache). None where nothing checks."""
    gate = [p['gate_ms'] / 1000 for p in live if p.get('gate_ms') is not None]
    if not gate:
        return None
    ready = [p['ready_s'] for p in live if p.get('gate_ms') is not None and p.get('ready_s') is not None]
    return (f"- Connect → `ready`, Mark mistakes: median {f(q(ready, .5), ' s')}, p90 {f(q(ready, .9), ' s')}; the Premium "
            f"check in it: median {f(q(gate, .5), ' s')}, p90 {f(q(gate, .9), ' s')} ({len(gate)} takes).")


def summarize(entries, days, now=None, project=PROJECT):
    """The digest's Markdown."""
    now = now or dt.datetime.now(dt.timezone.utc)
    rows = list(lines(entries))
    takes = [p for k, p, *_ in rows if k == 'take']
    live = [p for p in takes if p.get('kind') == 'live']
    checks = [p for p in takes if p.get('kind') == 'check']
    inst = [p for k, p, *_ in rows if k == 'instance']
    drop = [p for k, p, *_ in rows if k == 'dropped']
    refused = [p for k, p, *_ in rows if k == 'refused']
    errors = [p for k, p, *_ in rows if k == 'error']
    labels = [p for k, p, *_ in rows if k == 'label']
    revs = sorted({r for *_, r, _ in rows if r})

    where = '' if project == PROJECT else ' in production' if project == PROD else f' in {project}'
    out = [f'## Recitation checker{where}, the last {days} days (to {now:%Y-%m-%d %H:%M} UTC)', '',
           f'Revisions: {", ".join(revs) or "none"}. Numbers only, from the checker\'s health lines '
           f'(`scripts/recite-check/health.py`).', '']
    if not rows:
        return '\n'.join(out + ['No health lines in this span.'])

    audio_h = sum(p.get('audio_s', 0) for p in takes) / 3600
    by_level = {}
    for p in takes:
        by_level.setdefault(f"{p.get('kind')} · {p.get('level')}" + (f" · {p['ear']}" if p.get('ear') else '')
                            + (' (pair)' if p.get('_pair') else ''), []).append(p)
    # the model's CPU per second of audio, per model: v6 pads each window (about 20% more than the released model), so
    # instance speed is read within one model. A line from before `ear` was on the released model.
    by_ear = {}
    for p in takes:
        if p.get('model_per_s') is not None:
            by_ear.setdefault((p.get('ear') or 'released').split('+')[0], []).append(p['model_per_s'])
    out += ['### Takes', '', '| | Takes | Audio | p50 length | Kept | Marks (median) |', '| --- | --- | --- | --- | --- | --- |']
    for name, ps in sorted(by_level.items()):
        kept = [p['kept'] for p in ps if 'kept' in p]
        out.append(f"| {name} | {len(ps)} | {sum(p.get('audio_s', 0) for p in ps) / 60:.1f} min "
                   f"| {f(q([p.get('audio_s') for p in ps], .5), ' s', 0)} "
                   f"| {sum(kept)}/{len(kept)} | {f(q([p.get('marks') for p in ps], .5), '', 0)} |")
    out += ['', f"{len(takes)} take{'' if len(takes) == 1 else 's'}, {audio_h:.2f} h of audio.", '']

    cold = [p for p in live if p.get('cold')]
    out += ['### Cold starts', '',
            f"- Instances started: {len(inst)}. Process start → ready: median {f(q([p.get('ready_s') for p in inst], .5), ' s', 1)}"
            f" (imports {f(q([p.get('imports_s') for p in inst], .5), ' s', 1)}, the checker "
            f"{f(q([p.get('engine_s') for p in inst], .5), ' s', 1)}). Word table in the image: "
            f"{sum(1 for p in inst if p.get('words'))}/{len(inst)}.",
            f"- Live takes that were their instance's first: {len(cold)} of {len(live)}"
            + (f" ({100 * len(cold) / len(live):.0f}%)" if live else '') + '.',
            f"- Connect → `ready`: cold median {f(q([p.get('ready_s') for p in cold], .5), ' s')}, warm median "
            f"{f(q([p.get('ready_s') for p in live if not p.get('cold')], .5), ' s')}, worst "
            f"{f(q([p.get('ready_s') for p in live], 1), ' s')}.", *[x for x in [premium_check(live)] if x], '']

    out += ['### Keeping up with the reciter (live)', '',
            f"- Audio waiting before its events went out: median of takes' p50 {f(q([p.get('lag_p50') for p in live], .5), ' s')}, "
            f"median p90 {f(q([p.get('lag_p90') for p in live], .5), ' s')}, worst {f(q([p.get('lag_max') for p in live], 1), ' s')}.",
            stop_to_done(live),
            f"- Instance speed (the model's CPU per second of audio; Cloud Run's CPUs differ): " + ('; '.join(
                f"{ear} {f(q(xs, 0), '', 3)}–{f(q(xs, 1), '', 3)}, median {f(q(xs, .5), '', 3)}"
                for ear, xs in sorted(by_ear.items())) or '–') + ". Pure-Python bench at start: "
            f"{f(q([p.get('bench_ms') for p in inst], 0), ' ms', 0)}–{f(q([p.get('bench_ms') for p in inst], 1), ' ms', 0)}.",
            '- CPU per second of audio, median by level: ' + (', '.join(
                f"{name} {f(q([p.get('cpu_per_s') for p in ps], .5), '', 2)}" for name, ps in sorted(by_level.items()))
                or '–') + '.', '']

    resumed = [p for p in live if (p.get('sockets') or 0) > 1]
    restarted = [p for p in takes + drop if p.get('restarted')]
    out += ['### Resumes, drops, refusals, errors', '',
            f"- Live takes resumed on the same instance: {len(resumed)}; started again on another: {len(restarted)}.",
            f"- Dropped (the phone went and never came back here): {len(drop)}"
            + (f" ({', '.join(f'{k} {v}' for k, v in sorted(count(drop, 'at').items()))})" if drop else '') + '.',
            '- Refused: ' + (', '.join(f'{k} {v}' for k, v in sorted(count(refused, 'route', 'reason').items())) or 'none') + '.',
            *(['- App Check (APP_CHECK log or on), takes: '
               + ', '.join(f'{k} {v}' for k, v in sorted(count(checked, 'appcheck').items())) + '.']
              if (checked := [p for p in takes if p.get('appcheck')]) else []),
            '- Errors: ' + (', '.join(f'{k} {v}' for k, v in sorted(count(errors, 'route').items())) or 'none') + '.',
            '- "Not a mistake": ' + (', '.join(f'{k} {v}' for k, v in sorted(count(labels, 'kind').items())) or 'none') + '.',
            '- Why live takes ended: ' + (', '.join(f'{k} {v}' for k, v in sorted(count(live, 'why').items())) or '–') + '.',
            '']

    # what Cloud Run bills: an instance while it holds a request (a take's socket, a check) and while it starts
    held = held_seconds(takes, drop) + sum(p.get('ready_s', 0) for p in inst)
    vcpu_s, gib_s = held * VCPU, held * GIB
    month = 30 / days
    over = max(0.0, vcpu_s * month - FREE_VCPU_S) * PRICE_VCPU_S + max(0.0, gib_s * month - FREE_GIB_S) * PRICE_GIB_S
    out += ['### Cost', '',
            f"- Instance time held: {held / 3600:.2f} h ({vcpu_s:,.0f} vCPU-s, {gib_s:,.0f} GiB-s), "
            f"{100 * vcpu_s * month / FREE_VCPU_S:.1f}% of a month's free vCPU-seconds at this pace.",
            f"- At this pace for a month, past the free tier: ${over:.2f} (if nothing else on the billing account used it).",
            f"- Per hour of audio: {f(held / 3600 / audio_h if audio_h else None, ' h held', 2)}.", '']
    return '\n'.join(out)


def count(ps, *keys):
    out = {}
    for p in ps:
        k = ' / '.join(str(p.get(x)) for x in keys)
        out[k] = out.get(k, 0) + 1
    return out


def post(body, project=PROJECT):
    """A comment on the digest's issue: dev's, or (production) its own issue, label recite-health-prod."""
    gh = ['gh', '-R', REPO]
    prod = project == PROD
    label, title = (LABEL + '-prod', TITLE.replace('health', 'health, production')) if prod else (LABEL, TITLE)
    found = subprocess.run(gh + ['issue', 'list', '--label', label, '--state', 'open', '--json', 'number', '--jq',
                                 '.[0].number'], check=True, capture_output=True, text=True).stdout.strip()
    if not found:
        subprocess.run(gh + ['label', 'create', label, '--color', '5319e7', '--description',
                             f'The recitation checker ({"production" if prod else "dev"}): its weekly digest',
                             '--force'], check=True, capture_output=True)
        url = subprocess.run(gh + ['issue', 'create', '--title', title, '--label', label, '--body',
                                   'The recitation checker\'s weekly digest (`scripts/recite-check/digest.py`): '
                                   f'numbers only, from {project}\'s logs.' + ('' if prod else ' Dev only.')],
                             check=True, capture_output=True, text=True).stdout.strip()
        found = url.rstrip('/').rsplit('/', 1)[-1]
    subprocess.run(gh + ['issue', 'comment', found, '--body-file', '-'], input=body, check=True, text=True,
                   capture_output=True)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=7)
    ap.add_argument('--post', action='store_true')
    ap.add_argument('--file')
    ap.add_argument('--project', default=PROJECT, help=f'whose checker: {PROJECT} (default) or {PROD}')
    a = ap.parse_args()
    entries = json.load(open(a.file)) if a.file else read_logs(a.days, a.project)
    body = summarize(entries, a.days, project=a.project)
    print(body)
    if a.post:
        print(f'\nposted on #{post(body, a.project)}', file=sys.stderr)


if __name__ == '__main__':
    main()
