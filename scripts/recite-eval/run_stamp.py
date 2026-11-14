"""A checker run's stamp, results/<name>/_run.json: which checker made it, so runs made by different checkers are
never compared side by side by mistake. The /record comparison (Nov 14 2026) scored the released model from a run
made before three checker fixes, against the teacher's made after them.

  write(results_dir, params, ear)                    checker.py, at the start of each run
  check([results_dir, ...], current=False, mixed=False)
      prints each run's stamp; stops (SystemExit) if a run has none, if they come from different checkers (unless
      mixed), or, with current, if a run's checker isn't today's.
"""
import datetime
import hashlib
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
CODE = ('checker.py', 'bench.py', 'tajweed.py', 'letters_v2.py', 'nasal_rules.py')  # what a run's answer depends on


def code_hash():
    """A hash of the checker's code as it is on disk now (uncommitted changes included)."""
    h = hashlib.sha256()
    for f in CODE:
        p = HERE / f
        if p.exists():
            h.update(f.encode())
            h.update(p.read_bytes())
    return h.hexdigest()[:12]


def _git(*args):
    try:
        return subprocess.run(['git', '-C', str(HERE), *args], capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ''


def write(results_dir, params, ear):
    stamp = {'commit': _git('rev-parse', '--short=8', 'HEAD'),
             'dirty': bool(_git('status', '--porcelain', '--', *CODE)),
             'code': code_hash(), 'ear': ear, 'params': params,
             'at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}
    pathlib.Path(results_dir, '_run.json').write_text(json.dumps(stamp, indent=1))
    return stamp


def read(results_dir):
    p = pathlib.Path(results_dir, '_run.json')
    return json.loads(p.read_text()) if p.exists() else None


def describe(name, s):
    if not s:
        return f'{name}: NO STAMP (made before runs were stamped: rerun it with the current checker)'
    return (f"{name}: checker {s['commit']}{' with uncommitted changes' if s['dirty'] else ''}, code {s['code']}, "
            f"ear {s['ear']}, {s['at'][:16]}")


def check(dirs, current=False, mixed=False):
    stamps = {pathlib.Path(d).name: read(d) for d in dirs}
    for name, s in stamps.items():
        print(describe(name, s))
    codes = {s['code'] if s else None for s in stamps.values()}
    if None in codes:
        raise SystemExit('a run has no stamp: rerun it with the current checker')
    if len(codes) > 1 and not mixed:
        raise SystemExit('these runs come from different checkers: rerun them with the current checker (or pass --mixed)')
    if current and codes != {code_hash()}:
        raise SystemExit(f'made by an older checker than today\'s (code {code_hash()}): rerun it')
    return stamps
