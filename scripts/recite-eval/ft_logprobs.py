#!/usr/bin/env python3
"""The phoneme log-probabilities of a fine-tuned checkpoint on the test sets, cached where the evaluations read them:
qdat (runs/qdat/logprobs/<name>), the bench's recordings and the learners (runs/v0/logprobs/<name>, keyed as the
checker keys them). Same windows as checker.Hisn.logprobs (20 s, hop 16 s)."""
import argparse, json, os, pathlib, sys
import numpy as np, soundfile as sf
HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
import hisn_torch  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ckpt', default=None)
    ap.add_argument('--name', required=True)
    ap.add_argument('--sets', default='qdat,learners,bench')
    ap.add_argument('--device', default='mps')
    ap.add_argument('--only', default='')
    ap.add_argument('--kind', default='student', help='student (hisn_torch) or teacher (teacher_ear: Muaalem)')
    a = ap.parse_args()
    if a.kind == 'teacher':
        from teacher_ear import TeacherEar
        ear = TeacherEar(a.ckpt, device=a.device, name=a.name)
    else:
        ear = hisn_torch.Ear(a.ckpt, device=a.device, name=a.name)
    jobs = []
    if 'qdat' in a.sets:
        for m in json.loads((LAB / 'data/qdat/index.json').read_text()):
            jobs.append((LAB / 'data/qdat' / f"{m['id']}.wav", LAB / 'runs/qdat/logprobs' / a.name / f"{m['id']}.npy"))
    for s, d in (('learners', 'learners-v0'), ('bench', 'bench-v0'), ('short', 'bench-v0-short')):
        if s in a.sets.split(','):
            for f in sorted((LAB / 'data' / d / 'items').glob('*.json')):
                if a.only and a.only not in f.name:
                    continue
                t = json.loads(f.read_text())
                jobs.append((f.with_suffix('.wav'), LAB / 'runs/v0/logprobs' / a.name / f"{t.get('sha1') or t['id']}.npy"))
    done = 0
    for wav, out in jobs:
        if out.exists():
            continue
        x, sr = sf.read(wav, dtype='float32')
        if x.ndim > 1:
            x = x.mean(axis=1)
        out.parent.mkdir(parents=True, exist_ok=True)
        np.save(out, ear.logprobs(x).astype(np.float16))
        done += 1
        if done % 100 == 0:
            print(done, len(jobs), flush=True)
    print('done', done, 'new of', len(jobs))


if __name__ == '__main__':
    main()
