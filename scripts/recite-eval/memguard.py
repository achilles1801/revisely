#!/usr/bin/env python3
"""Run a lab job under a memory limit, so it can never fill the Mac's memory again (it did on Nov 10 2026: two data
workers held 45 + 36 GB on a 24 GB Mac and the kernel panicked).

Every 2 seconds it adds up the resident memory of the job and every process it started. It stops the whole job
(SIGTERM, then SIGKILL after 5 s) when that total passes --limit-gb, or when the Mac's available memory drops under
--min-free-gb, whoever is using it. Resident memory counts memory-mapped file pages too, so it errs towards stopping
early; heavy jobs belong on Modal anyway.

  ~/revisely-mistake-lab/.venv/bin/python ~/revisely-mistake-lab/tools/memguard.py [--limit-gb 6] -- python job.py ...

Exit code: the job's own, or 137 if the guard stopped it (the reason is printed to stderr).
"""
import argparse
import os
import signal
import subprocess
import sys
import time

import psutil

GB = 1024 ** 3


def tree_rss(p):
    total = 0
    try:
        procs = [p] + p.children(recursive=True)
    except psutil.NoSuchProcess:
        return 0
    for q in procs:
        try:
            total += q.memory_info().rss
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return total


def stop(proc, why):
    print(f'memguard: stopping the job: {why}', file=sys.stderr, flush=True)
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    for _ in range(50):
        if proc.poll() is not None:
            return
        time.sleep(0.1)
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit-gb', type=float, default=6.0, help='the job and its children together (default 6)')
    ap.add_argument('--min-free-gb', type=float, default=2.0, help="stop if the Mac's available memory drops under this")
    ap.add_argument('--every', type=float, default=2.0, help='seconds between checks')
    ap.add_argument('cmd', nargs=argparse.REMAINDER)
    a = ap.parse_args()
    cmd = a.cmd[1:] if a.cmd and a.cmd[0] == '--' else a.cmd
    if not cmd:
        ap.error('give the command after --')
    proc = subprocess.Popen(cmd, start_new_session=True)  # its own process group, so its workers stop with it
    p = psutil.Process(proc.pid)
    peak = 0
    try:
        while proc.poll() is None:
            rss = tree_rss(p)
            peak = max(peak, rss)
            avail = psutil.virtual_memory().available
            if rss > a.limit_gb * GB:
                stop(proc, f'it uses {rss / GB:.1f} GB (limit {a.limit_gb:g} GB)')
                return 137
            if avail < a.min_free_gb * GB:
                stop(proc, f"the Mac has only {avail / GB:.1f} GB available (floor {a.min_free_gb:g} GB); the job uses {rss / GB:.1f} GB")
                return 137
            time.sleep(a.every)
    except KeyboardInterrupt:
        stop(proc, 'interrupted')
        return 130
    print(f'memguard: done, peak {peak / GB:.2f} GB', file=sys.stderr, flush=True)
    return proc.returncode


if __name__ == '__main__':
    sys.exit(main())
