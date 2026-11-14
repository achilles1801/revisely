"""Free check 1 (review, Nov 14 2026): a word-settings curve per ear, from cached log-probabilities (no model run).

The deployed words step (engine.WORDS_P: sub_p 1.01, alt_rule skeleton, del_frac 0.67) with the two settings that
make most false word marks on correct learners swept: alt_pen (the cost of hearing a look-alike word) and mean_gop (a
word whose sounds fit this badly on average is wrong). Each setting runs checker.py on learners-v0, and the share of
correct / incorrect clips with any word mark comes from learner_flags.py.

  python word_sweep.py hisn teacher8k  -> runs/word_sweep.json (+ printed table)
"""
import itertools
import json
import os
import pathlib
import re
import subprocess
import sys

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
H = pathlib.Path(__file__).resolve().parent
PY = str(LAB / '.venv/bin/python')
BASE = {'sub_p': 1.01, 'alt_rule': 'skeleton', 'del_frac': 0.67}
ALT_PEN = [-3.0, -5.0, -7.0, -9.0, -12.0]
MEAN_GOP = [-5.0, -6.0, -7.0, -8.0, -10.0, None]


def run(ear, alt_pen, mean_gop, bench='learners-v0'):
    tag = f"sweep.{ear}.a{-alt_pen:g}.g{'off' if mean_gop is None else f'{-mean_gop:g}'}"
    if bench != 'learners-v0':
        tag += '.' + bench
    P = dict(BASE, alt_pen=alt_pen, mean_gop=mean_gop)
    import run_stamp
    st = run_stamp.read(LAB / 'runs/v0/results' / tag)
    if not st or st['code'] != run_stamp.code_hash():  # none yet, or made by another checker: run it
        subprocess.run([PY, str(LAB / 'tools/memguard.py'), '--limit-gb', '8', '--', PY, '-I', str(H / 'checker.py'),
                        '--bench', str(LAB / 'data' / bench), '--run', str(LAB / 'runs/v0'), '--name', tag,
                        '--ear', ear, '--jobs', '10', '--params', json.dumps(P)],
                       check=True, cwd=LAB, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return tag


def learner_rates(tag):
    out = subprocess.run([PY, '-I', str(H / 'learner_flags.py'), tag], check=True, cwd=LAB, capture_output=True,
                         text=True).stdout
    m = re.search(r'correct flagged (\d+)/(\d+) = [0-9.]+%; incorrect flagged (\d+)/(\d+)', out)
    ok, n_ok, bad, n_bad = map(int, m.groups())
    return round(100 * ok / n_ok, 1), round(100 * bad / n_bad, 1)


def main():
    path = LAB / 'runs/word_sweep.json'
    res = json.loads(path.read_text()) if path.exists() else {}  # other ears' rows are kept
    for ear in sys.argv[1:]:
        for alt_pen, mean_gop in itertools.product(ALT_PEN, MEAN_GOP):
            tag = run(ear, alt_pen, mean_gop)
            res[tag] = {'ear': ear, 'alt_pen': alt_pen, 'mean_gop': mean_gop, 'learners': learner_rates(tag)}
            print(f"{ear:10s} alt_pen {alt_pen:6g} mean_gop {str(mean_gop):6s} correct marked {res[tag]['learners'][0]:5.1f}%"
                  f"  with mistakes marked {res[tag]['learners'][1]:5.1f}%", flush=True)
    path.write_text(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
