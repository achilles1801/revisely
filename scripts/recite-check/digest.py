#!/usr/bin/env python3
"""The recitation checker's weekly digest (Majd approved Nov 15 2026): its health lines (health.py) from Cloud Logging,
summed up as Markdown. Numbers only, as the lines are.

  python digest.py                 the last 7 days, printed
  python digest.py --days 30       another span
  python digest.py --post          also a comment on the "Recitation checker health" issue (label recite-health),
                                   made if missing (gh, signed in to this repository)
  python digest.py --file F.json   lines from a file (a JSON list of log entries) instead of Cloud Logging

Reads revisely-dev's logs with `gcloud logging read` (logging.viewer is enough). README, "Health".
"""
import argparse
import datetime as dt
import json
import subprocess
import sys

PROJECT = 'revisely-dev'
SERVICE = 'recite-check'
REPO = 'achilles1801/revisely'
LABEL = 'recite-health'
TITLE = 'Recitation checker health (weekly digest)'
# Cloud Run, request-based billing, tier 1 (us-east1), and this service's size (README, "Deploying")
VCPU, GIB = 1, 2
PRICE_VCPU_S, PRICE_GIB_S = 0.000024, 0.0000025
FREE_VCPU_S, FREE_GIB_S = 180_000, 360_000  # a month, per billing account (shared with everything else on it)


def read_logs(days):
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%SZ')
    q = (f'resource.type="cloud_run_revision" AND resource.labels.service_name="{SERVICE}" '
         f'AND jsonPayload.health:* AND timestamp>="{since}"')
    out = subprocess.run(['gcloud', 'logging', 'read', q, '--project', PROJECT, '--format', 'json', '--limit',
                          '100000'], check=True, capture_output=True, text=True).stdout
    return json.loads(out or '[]')


def lines(entries):
    """(kind, fields, revision, instance) of each health line."""
    for e in entries:
        p = e.get('jsonPayload') or {}
        if 'health' in p:
            yield (p['health'], p, (e.get('resource') or {}).get('labels', {}).get('revision_name'),
                   (e.get('labels') or {}).get('instanceId'))


def q(xs, p):
    """The p-quantile (0–1) of xs, or None."""
    xs = sorted(x for x in xs if isinstance(x, (int, float)))
    return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else None


def f(x, unit='', nd=2):
    return '–' if x is None else f'{x:.{nd}f}{unit}'


def summarize(entries, days, now=None):
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

    out = [f'## Recitation checker, the last {days} days (to {now:%Y-%m-%d %H:%M} UTC)', '',
           f'Revisions: {", ".join(revs) or "none"}. Numbers only, from the checker\'s health lines '
           f'(`scripts/recite-check/health.py`).', '']
    if not rows:
        return '\n'.join(out + ['No health lines in this span.'])

    audio_h = sum(p.get('audio_s', 0) for p in takes) / 3600
    by_level = {}
    for p in takes:
        by_level.setdefault(f"{p.get('kind')} · {p.get('level')}", []).append(p)
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
            f"{f(q([p.get('ready_s') for p in live], 1), ' s')}.", '']

    out += ['### Keeping up with the reciter (live)', '',
            f"- Audio waiting before its events went out: median of takes' p50 {f(q([p.get('lag_p50') for p in live], .5), ' s')}, "
            f"median p90 {f(q([p.get('lag_p90') for p in live], .5), ' s')}, worst {f(q([p.get('lag_max') for p in live], 1), ' s')}.",
            f"- Instance speed (the model's CPU per second of audio; Cloud Run's CPUs differ): "
            f"{f(q([p.get('model_per_s') for p in takes], 0), '', 3)}–{f(q([p.get('model_per_s') for p in takes], 1), '', 3)}"
            f", median {f(q([p.get('model_per_s') for p in takes], .5), '', 3)}. Pure-Python bench at start: "
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
            '- Errors: ' + (', '.join(f'{k} {v}' for k, v in sorted(count(errors, 'route').items())) or 'none') + '.',
            '- "Not a mistake": ' + (', '.join(f'{k} {v}' for k, v in sorted(count(labels, 'kind').items())) or 'none') + '.',
            '- Why live takes ended: ' + (', '.join(f'{k} {v}' for k, v in sorted(count(live, 'why').items())) or '–') + '.',
            '']

    # what Cloud Run bills: an instance while it holds a request (a take's socket, a check) and while it starts
    held = sum(p.get('open_s', 0) for p in live) + sum(p.get('wall_s', 0) for p in checks) \
        + sum(p.get('ready_s', 0) for p in inst)
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


def post(body):
    gh = ['gh', '-R', REPO]
    found = subprocess.run(gh + ['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number', '--jq',
                                 '.[0].number'], check=True, capture_output=True, text=True).stdout.strip()
    if not found:
        subprocess.run(gh + ['label', 'create', LABEL, '--color', '5319e7', '--description',
                             'The recitation checker (dev): its weekly digest', '--force'], check=True,
                       capture_output=True)
        url = subprocess.run(gh + ['issue', 'create', '--title', TITLE, '--label', LABEL, '--body',
                                   'The recitation checker\'s weekly digest (`scripts/recite-check/digest.py`): '
                                   'numbers only, from revisely-dev\'s logs. Dev only.'],
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
    a = ap.parse_args()
    entries = json.load(open(a.file)) if a.file else read_logs(a.days)
    body = summarize(entries, a.days)
    print(body)
    if a.post:
        print(f'\nposted on #{post(body)}', file=sys.stderr)


if __name__ == '__main__':
    main()
