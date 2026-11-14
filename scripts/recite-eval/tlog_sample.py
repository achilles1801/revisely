"""A sample of Tarteel's tlog (tarteel-ai/tlog, CC-BY-4.0; gated on Hugging Face, Majd's account accepted its terms)
before deciding on v6: how many clips, how many hours, how many the released model agrees with (tarteel_users.label,
the same filter v5 used), and how many v5 already had from the public copy (ashraf-ali/quran-data, same file names).

Nothing is kept: each container reads one shard of the clean split from Hugging Face, labels it and returns numbers.
No volume. Lab only, run with `modal run` (never deployed); the owner's Modal rules in modal_batch.py apply.

  modal run tlog_sample.py --shards 16        -> runs/tlog-sample.json
"""
import json
import os
import pathlib
import sys
import time

import modal

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
SHARDS = 411
app = modal.App('revisely-lab-tlog-sample')
# the same layers as modal_batch.py's image (cached), then the released model
image = (modal.Image.debian_slim(python_version='3.12')
         .apt_install('curl', 'libsndfile1')
         .pip_install('torch==2.15.0', 'transformers==4.57.6', 'safetensors', 'onnxruntime==1.31.1', 'numpy', 'scipy',
                      'soundfile', 'pyarrow', 'Levenshtein==0.27.5', 'quran-transcript==0.6.4', 'pyworld',
                      'setuptools<81', 'huggingface_hub', 'psutil')
         .env({'LAB': '/lab', 'PYTHONWARNINGS': 'ignore', 'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1',
               'MKL_NUM_THREADS': '1'})
         .add_local_dir(HERE, '/root/recite-eval', ignore=['__pycache__', '*.pyc'])
         .add_local_dir(LAB / 'models/hisnlabs-tajweed-v2', '/lab/models/hisnlabs-tajweed-v2',
                        ignore=['__pycache__', '*.pyc']))


@app.function(image=image, secrets=[modal.Secret.from_name('huggingface')], cpu=2.0, memory=4096, timeout=3600,
              max_containers=20)
def shard(i: int):
    sys.path.insert(0, '/root/recite-eval')
    os.chdir('/root/recite-eval')
    import pyarrow.parquet as pq
    from huggingface_hub import HfFileSystem
    import checker
    import tarteel_users as tu
    t0 = time.process_time()
    f = HfFileSystem().open(f'datasets/tarteel-ai/tlog/data/clean-{i:05d}-of-{SHARDS:05d}.parquet', 'rb')
    pf = pq.ParquetFile(f)
    ear = checker.Hisn(threads=2)
    phon = {}
    out = {'shard': i, 'rows': 0, 'secs': 0.0, 'kept': 0, 'kept_secs': 0.0, 'dropped': {}, 'per': [], 'names': [],
           'kept_names': [], 'surahs': {}}
    for g in range(pf.metadata.num_row_groups):
        for r in pf.read_row_group(g, columns=['audio']).to_pylist():
            out['rows'] += 1
            name = os.path.splitext(os.path.basename(r['audio']['path'] or ''))[0]  # tlog: .flac; the public copy: .wav
            out['names'].append(name)
            try:
                s, a = map(int, name.split('_')[:2])
                x = tu.audio(r['audio']['bytes'])
            except Exception:
                out['dropped']['decode'] = out['dropped'].get('decode', 0) + 1
                continue
            out['secs'] += len(x) / 16000
            if len(x) < 24000 or len(x) > 16000 * 30:
                out['dropped']['length'] = out['dropped'].get('length', 0) + 1
                continue
            got = tu.label(ear, phon, s, a, x)
            if isinstance(got, str):
                out['dropped'][got] = out['dropped'].get(got, 0) + 1
                continue
            out['kept'] += 1
            out['kept_secs'] += len(x) / 16000
            out['per'].append(round(got[5], 4))
            out['kept_names'].append(name)
            out['surahs'][s] = out['surahs'].get(s, 0) + 1
    out['cpu_s'] = round(time.process_time() - t0, 1)
    return out


@app.local_entrypoint()
def main(shards: int = 16):
    import csv
    import io
    import urllib.request
    picks = sorted({k * SHARDS // shards for k in range(shards)})
    res = list(shard.map(picks))
    req = urllib.request.Request('https://huggingface.co/datasets/ashraf-ali/quran-data/resolve/main/users_ayahs.csv',
                                 headers={'User-Agent': 'revisely-lab'})
    with urllib.request.urlopen(req, timeout=60) as r:
        had = {os.path.splitext(os.path.basename(row['file_name']))[0]
               for row in csv.DictReader(io.StringIO(r.read().decode('utf-8')))}
    rows = sum(x['rows'] for x in res)
    kept = sum(x['kept'] for x in res)
    names = [n for x in res for n in x['names']]
    kept_names = [n for x in res for n in x['kept_names']]
    dropped = {}
    for x in res:
        for k, v in x['dropped'].items():
            dropped[k] = dropped.get(k, 0) + v
    pers = sorted(p for x in res for p in x['per'])
    surahs = {}
    for x in res:
        for k, v in x['surahs'].items():
            surahs[int(k)] = surahs.get(int(k), 0) + v
    scale = SHARDS / len(picks)
    summary = {
        'shards': picks,
        'rows': rows,
        'hours': round(sum(x['secs'] for x in res) / 3600, 2),
        'kept': kept,
        'kept_hours': round(sum(x['kept_secs'] for x in res) / 3600, 2),
        'kept_share': round(kept / max(rows, 1), 3),
        'dropped': dropped,
        'per_median_kept': pers[len(pers) // 2] if pers else None,
        'in_public_copy': sum(n in had for n in names),
        'kept_in_public_copy': sum(n in had for n in kept_names),
        'surahs_with_kept': len(surahs),
        'cpu_s': round(sum(x['cpu_s'] for x in res), 1),
        'whole_clean_split_estimate': {
            'clips': round(rows * scale),
            'hours': round(sum(x['secs'] for x in res) / 3600 * scale),
            'kept_hours_new': round((sum(x['kept_secs'] for x in res) / 3600) * scale
                                    * (1 - sum(n in had for n in kept_names) / max(kept, 1))),
            'cpu_hours': round(sum(x['cpu_s'] for x in res) / 3600 * scale, 1),
        },
    }
    out = LAB / 'runs/tlog-sample.json'
    out.write_text(json.dumps(summary, indent=1, ensure_ascii=False))
    print(json.dumps(summary, indent=1, ensure_ascii=False))
