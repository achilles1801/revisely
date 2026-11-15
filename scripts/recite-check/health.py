"""Numbers-only health lines (README, "Health"; Majd approved Nov 15 2026).

One JSON line per take, refusal, error, dropped session and instance start, printed to stdout. Cloud Run's logging
stores a JSON line as `jsonPayload`; `health` names the kind ('take', 'refused', 'error', 'dropped', 'instance') and
`digest.py` reads them back for the weekly digest.

Never a uid, a take's name, a passage, a word or audio: only counts, seconds, levels and reasons. Cloud Run adds the
revision and the instance to every line itself.
"""
import json
import os
import pathlib
import re
import resource
import time

BOOT = time.monotonic()  # the server imports this first, so an instance's age counts from about its start
STATE = {'takes': 0}     # takes started on this instance: the first one met whatever the cold start left
PARTS = ('model', 'words', 'tajweed', 'similar')  # the checker's `ms` parts, as CPU per second of audio
APP = re.compile(r'^[0-9A-Za-z .()_-]{1,48}$')   # "1.0.4 (40) dev 3fa9c1d2", as the app tags /check


def emit(line, /, **fields):
    """The line itself; a field that is None is left out. `line` is positional only: a field may be called `kind`."""
    rec = {'severity': 'INFO', 'message': f'health {line}', 'health': line}
    rec.update({k: v for k, v in fields.items() if v is not None})
    print(json.dumps(rec, separators=(',', ':')), flush=True)


def cpu():
    """CPU seconds this process has used (every thread). With one take per instance, a take's share is the change."""
    r = resource.getrusage(resource.RUSAGE_SELF)
    return r.ru_utime + r.ru_stime


try:
    CLOCK_TICKS = os.sysconf('SC_CLK_TCK')
except (AttributeError, ValueError, OSError):
    CLOCK_TICKS = 100


def age():
    """Seconds since this instance's process started (Linux: from /proc), else since BOOT."""
    try:
        up = float(pathlib.Path('/proc/uptime').read_text().split()[0])
        started = int(pathlib.Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()[19])
        return up - started / CLOCK_TICKS
    except (OSError, ValueError, IndexError):
        return time.monotonic() - BOOT


def level(settings, follow):
    """'recite', 'harakat' (Words and harakat) or 'strict', with '+letters' when letters are on."""
    if follow:
        return 'recite'
    name = 'harakat' if str(settings.get('tajweed', '1')) == '0' else 'strict'
    return name + ('+letters' if str(settings.get('letters', '0')) == '1' else '')


def per_second(ms, secs):
    """{<part>_per_s: CPU seconds per second of audio} from the checker's `ms`. `model_per_s` is also how fast this
    instance's CPU is: the same model costs 0.12–0.27 on Cloud Run's different CPUs (README, "Health")."""
    if not secs or not isinstance(ms, dict):
        return {}
    return {f'{k}_per_s': round(ms[k] / 1000 / secs, 3) for k in PARTS if isinstance(ms.get(k), (int, float))}


def lag(samples):
    """p50, p90 and max of how long audio waited from arriving on the socket to its events going out (seconds)."""
    if not samples:
        return {}
    xs = sorted(samples)
    pick = lambda q: round(xs[min(len(xs) - 1, int(q * len(xs)))], 3)  # noqa: E731
    return {'lag_p50': pick(0.5), 'lag_p90': pick(0.9), 'lag_max': round(xs[-1], 3)}


def app_tag(v):
    """The app's own tag (version, build, channel, update), only in that shape; anything else is left out."""
    return v if isinstance(v, str) and APP.match(v) else None


def bench_ms():
    """A fixed bit of pure Python, timed: how fast this instance's CPU is, apart from any take."""
    t0 = time.perf_counter()
    n = 0
    for i in range(300_000):
        n += i * i % 7
    return round((time.perf_counter() - t0) * 1000, 1)
