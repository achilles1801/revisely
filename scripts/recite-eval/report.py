#!/usr/bin/env python3
"""Markdown tables comparing scored runs (the JSON files score.py writes with --json, grouped by condition/variant).

  python report.py NAME=path/to/score.json [NAME=...]  > baselines.md
"""
import json
import sys

ROWS = [
    ('False alarms / 100 words, clean audio', 'clean/all', 'fa_per_100'),
    ('False alarms / 100 words, mild noise (20 dB)', 'babble20/all', 'fa_per_100'),
    ('False alarms / 100 words, loud noise (10 dB)', 'babble10/all', 'fa_per_100'),
    ('Clean recordings with no false alarm', 'clean/clean', 'clean_pass'),
    ('Words reached (clean)', 'clean/all', 'coverage'),
    ('Words reached (10 dB)', 'babble10/all', 'coverage'),
    ('Follow lag, median s (clean)', 'clean/all', 'lag_median_s'),
    ('Follow lag, 90th pct s (clean)', 'clean/all', 'lag_p90_s'),
    ('Words shown before said / 100 (clean)', 'clean/all', 'early_per_100'),
    ('Mistakes caught (excl. extra words), clean', 'clean/m1', 'recall_strict_no_ins'),
    ('Mistakes caught (excl. extra words), 10 dB', 'babble10/m1', 'recall_strict_no_ins'),
    ('Mistakes caught incl. extra words, clean', 'clean/m1', 'recall_strict'),
    ('Flags that are real mistakes, clean', 'clean/m1', 'precision'),
    ('Time to flag a mistake, median s (clean)', 'clean/m1', 'latency_median_s'),
    ('Time to flag a mistake, 90th pct s (clean)', 'clean/m1', 'latency_p90_s'),
]


def collapse(groups, prefix):
    """'clean/all' = clean/clean + clean/m1 are scored separately; take the 'all' when present."""
    return groups.get(prefix)


def main():
    runs = []
    for a in sys.argv[1:]:
        name, path = a.split('=', 1)
        data = json.load(open(path))
        runs.append((name, next(iter(data.values()))))
    print('| Measure | ' + ' | '.join(n for n, _ in runs) + ' |')
    print('| --- |' + ' --- |' * len(runs))
    for label, group, key in ROWS:
        cells = []
        for _, groups in runs:
            g = groups.get(group)
            cells.append(str(g.get(key, '')) if g else '')
        if any(cells):
            print(f'| {label} | ' + ' | '.join(cells) + ' |')
    print()
    print('Mistakes caught by type, clean audio (strict / within one word):')
    print()
    types = sorted({t for _, groups in runs for t in (groups.get('clean/m1') or {}).get('by_type', {})})
    print('| Type | ' + ' | '.join(n for n, _ in runs) + ' |')
    print('| --- |' + ' --- |' * len(runs))
    for t in types:
        cells = []
        for _, groups in runs:
            bt = (groups.get('clean/m1') or {}).get('by_type', {}).get(t)
            cells.append(f"{bt['strict']}% / {bt['near']}% (n={bt['n']})" if bt else '')
        print(f'| {t} | ' + ' | '.join(cells) + ' |')


if __name__ == '__main__':
    main()
