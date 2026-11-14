"""Training batches on Modal (cloud GPUs) instead of the Mac. Lab only, run with `modal run` (never deployed).

Rules (the owner's, Nov 10 2026):
- only `modal run`;
- every function times out within 3600 s;
- at most 2 GPUs, the cheapest that does the job;
- the volume is deleted after each batch;
- only public training recitations go up: Tadabur is pulled from Hugging Face inside Modal, and Muaalem's shards and
  our own weights are uploaded. Test data (qdat, RetaSy, bench-v0, /record) never leaves the Mac, and each model is
  tested there.

Volume `revisely-lab`, mounted at /vol, laid out like the lab (LAB=/vol):
- models/hisnlabs-tajweed-v2 and models/<init>.pt: uploaded by `upload`;
- data/train: Muaalem's shards, uploaded by `upload --muaalem 1`;
- data/tadabur and data/train2: Tadabur, fetched and labelled here;
- data/train3: Tarteel's user recordings (tarteel_users.py), fetched and labelled here;
- data/train4: tlog, Tarteel's fuller set (gated; Majd's Hugging Face token), labelled here (`tlog`);
- models/<out>/: checkpoints, downloaded by `fetch_model`.

  modal run modal_batch.py::upload --init models/ft-v3/step8000.pt [--muaalem 1]
  modal run modal_batch.py::prep --first 1 --last 200          # fetch + label Tadabur files, re-voice them
  modal run modal_batch.py::users                               # Tarteel's user recordings, one container a surah
  modal run modal_batch.py::train --out ft-v4 --init ft-v3.pt --steps 30000
  modal run modal_batch.py::fetch_model --out ft-v4
  modal volume delete revisely-lab                               # end of the batch
"""
import os
import pathlib
import subprocess
import sys

import modal

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
app = modal.App('revisely-lab')
vol = modal.Volume.from_name('revisely-lab', create_if_missing=True)
base = (modal.Image.debian_slim(python_version='3.12')
         .apt_install('curl', 'libsndfile1')
         .pip_install('torch==2.15.0', 'transformers==4.57.6', 'safetensors', 'onnxruntime==1.31.1', 'numpy', 'scipy',
                      'soundfile', 'pyarrow', 'Levenshtein==0.27.5', 'quran-transcript==0.6.4', 'pyworld',
                      'setuptools<81', 'huggingface_hub', 'psutil')
         .env({'LAB': '/vol', 'PYTHONWARNINGS': 'ignore', 'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1',
               'MKL_NUM_THREADS': '1'})  # one math thread a process: many data workers each spawning threads only fight
        )
image = base.add_local_dir(HERE, '/root/recite-eval', ignore=['__pycache__', '*.pyc'])
# the teacher (Muaalem's model code) for teacher_part and distil_part
image_m = base.pip_install('quran-muaalem==0.3.0').add_local_dir(HERE, '/root/recite-eval', ignore=['__pycache__', '*.pyc'])

SCRIPTS = '/root/recite-eval'


def _setup():
    sys.path.insert(0, SCRIPTS)
    os.chdir(SCRIPTS)
    vol.reload()


@app.function(image=image, volumes={'/vol': vol}, cpu=2.0, memory=4096, timeout=3600, max_containers=40)
def prep_one(i: int):
    """One Tadabur file: download from Hugging Face, cut to 16 kHz, drop test reciters, model + madd timing (pass 1)."""
    _setup()
    import tadabur_fetch, tadabur_label
    name, msg = tadabur_fetch.fetch(i)
    vol.commit()
    _, msg1 = tadabur_label.pass1(name)
    vol.commit()
    return f'{name}: {msg}; pass 1 {msg1}'


@app.function(image=image, volumes={'/vol': vol}, cpu=2.0, memory=4096, timeout=3600, max_containers=40)
def users_one(s: int):
    """One surah of Tarteel's user recordings: download, label with the madd lengths that fit, keep the close ones."""
    _setup()
    import tarteel_users
    r = tarteel_users.surah(s)
    vol.commit()
    return r


@app.function(image=image, volumes={'/vol': vol}, secrets=[modal.Secret.from_name('huggingface')], cpu=2.0,
              memory=4096, timeout=3600, max_containers=40)
def tlog_one(i: int, skip: list):
    """One shard of Tarteel's tlog (gated; Majd's Hugging Face token): labelled as the public copy (data/train4)."""
    _setup()
    import tarteel_users
    r = tarteel_users.tlog_shard(i, frozenset(skip))
    vol.commit()
    return r


@app.function(image=image, volumes={'/vol': vol}, cpu=8.0, memory=32768, timeout=3600)
def label_all():
    """Pass 2 for every fetched file: each reciter's madd lengths, then the labels (data/train2)."""
    _setup()
    import multiprocessing as mp
    import pickle
    import tadabur_label
    st = tadabur_label.styles()
    pickle.dump(st, open(tadabur_label.SRC / 'styles.pkl', 'wb'))
    names = sorted(p.name[:-len('.est.pkl')] for p in tadabur_label.SRC.glob('t*.est.pkl'))
    with mp.get_context('fork').Pool(8) as pool:
        for _ in pool.imap_unordered(tadabur_label.pass2, [(n, st) for n in names]):
            pass
    vol.commit()
    return f'{len(st)} reciters with a style; {len(names)} files labelled'


@app.function(image=image, volumes={'/vol': vol}, cpu=2.0, memory=4096, timeout=3600, max_containers=40)
def revoice_one(name: str, d: str):
    """Women's and children's voices for one shard (voices.py)."""
    _setup()
    import voices
    r = voices.shard((name, d))
    vol.commit()
    return r


@app.function(image=image_m, volumes={'/vol': vol}, gpu='L40S', cpu=8.0,
              memory=32768, timeout=3600)
def distil_part(args: list, workers: int = 6):
    """The student's training with the teacher beside it (train.py --teacher), up to about 45 minutes a call."""
    _setup()
    os.environ['HF_HOME'] = '/vol/hf-cache'
    sys.argv = ['train.py'] + args + ['--device', 'cuda', '--resume', '1', '--max_minutes', '45', '--workers', str(workers)]
    import importlib, hisn_torch, train
    importlib.reload(hisn_torch); importlib.reload(train)
    r = train.main()
    vol.commit()
    return r


@app.function(image=image, volumes={'/vol': vol}, gpu='A10G', cpu=4.0, memory=16384, timeout=3600)
def train_part(args: list, workers: int = 0, local: int = 0):
    """Up to about 50 minutes of training, then a save to <out>/last.pt; called again until it is done.
    local=1 copies the training data to this machine's own disk first: reading clips from the network volume one
    by one starved the GPU (it waited for data 60% of the time)."""
    _setup()
    import time
    if local:
        t = time.time()
        data = args[args.index('--data') + 1].split(',')
        os.makedirs('/tmp/lab/data', exist_ok=True)
        for d in data:
            subprocess.run(['cp', '-rL', f'/vol/{d}', f'/tmp/lab/{d}'], check=True)
        if not os.path.exists('/tmp/lab/models'):
            os.symlink('/vol/models', '/tmp/lab/models')
        os.environ['LAB'] = '/tmp/lab'
        print(f'copied {data} to local disk in {time.time() - t:.0f}s', flush=True)
    sys.argv = ['train.py'] + args + ['--device', 'cuda', '--resume', '1', '--max_minutes', '45', '--workers', str(workers)]
    import importlib, hisn_torch, train
    importlib.reload(hisn_torch); importlib.reload(train)
    r = train.main()
    vol.commit()
    return r


@app.function(image=image_m, volumes={'/vol': vol}, gpu='L40S', cpu=8.0,
              memory=32768, timeout=3600)
def teacher_part(args: list):
    """Up to about 45 minutes of the teacher's training (teacher_train.py), then a save to <out>/last.pt."""
    _setup()
    os.environ['HF_HOME'] = '/vol/hf-cache'  # Muaalem's 2.4 GB downloaded once, kept on the volume
    os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
    sys.argv = ['teacher_train.py'] + args + ['--device', 'cuda', '--resume', '1', '--max_minutes', '45']
    import importlib, train, teacher_train
    importlib.reload(train); importlib.reload(teacher_train)
    r = teacher_train.main()
    vol.commit()
    return r


@app.function(image=image, volumes={'/vol': vol}, cpu=1.0, memory=2048, timeout=600)
def listing(d: str):
    _setup()
    p = pathlib.Path('/vol') / d
    return sorted(x.name for x in p.glob('*')) if p.exists() else []


def _put(local, remote):
    subprocess.run([sys.executable, '-m', 'modal', 'volume', 'put', '-f', 'revisely-lab', str(local), remote], check=True)


@app.local_entrypoint()
def upload(init: str = 'models/ft-v3/step8000.pt', muaalem: int = 0):
    """The released model, the starting checkpoint and (muaalem=1) Muaalem's shards (no voice copies: re-made here)."""
    for f in ('model.safetensors', 'config.json', 'modeling.py', 'onnx/model-int8.onnx'):
        _put(LAB / 'models/hisnlabs-tajweed-v2' / f, f'/models/hisnlabs-tajweed-v2/{f}')
    _put(LAB / init, f'/models/{pathlib.Path(init).parent.name}.pt')
    if muaalem:
        for p in sorted((LAB / 'data/train').glob('*.meta.pkl')):
            if '.voice' in p.name:
                continue
            name = p.name[:-len('.meta.pkl')]
            _put(p, f'/data/train/{p.name}')
            _put(LAB / 'data/train' / f'{name}.audio.npy', f'/data/train/{name}.audio.npy')
    print('uploaded')


@app.local_entrypoint()
def prep(first: int = 1, last: int = 2, voices: int = 1):
    """Fetch and label Tadabur files first..last, label them all (pass 2), then re-voice what has no voice copy yet."""
    for r in prep_one.map(range(first, last + 1), return_exceptions=True):
        print(r)
    print(label_all.remote())
    if voices:
        jobs = []
        for d in ('data/train', 'data/train2'):
            names = listing.remote(d)
            have = {n[:-len('.voice.audio.npy')] for n in names if n.endswith('.voice.audio.npy')}
            jobs += [(n[:-len('.meta.pkl')], d) for n in names
                     if n.endswith('.meta.pkl') and '.voice' not in n and n[:-len('.meta.pkl')] not in have
                     and (d != 'data/train2' or int(n[1:6]) % 2 == 0)]  # half of Tadabur's files is enough
        for r in revoice_one.starmap(jobs, return_exceptions=True):
            print(r)


@app.local_entrypoint()
def users(first: int = 1, last: int = 114):
    for r in users_one.map(range(first, last + 1), return_exceptions=True):
        print(r, flush=True)


@app.local_entrypoint()
def tlog(first: int = 0, last: int = 410):
    """tlog's clean split, one container a shard, skipping clips already in the public copy (data/train3)."""
    import csv, io, urllib.request
    req = urllib.request.Request('https://huggingface.co/datasets/ashraf-ali/quran-data/resolve/main/users_ayahs.csv',
                                 headers={'User-Agent': 'revisely-lab'})
    with urllib.request.urlopen(req, timeout=60) as r:
        skip = sorted({os.path.splitext(os.path.basename(row['file_name']))[0]
                       for row in csv.DictReader(io.StringIO(r.read().decode('utf-8')))})
    for r in tlog_one.map(range(first, last + 1), kwargs={'skip': skip}, return_exceptions=True):
        print(r, flush=True)


@app.local_entrypoint()
def train(out: str = 'ft-v4', init: str = 'ft-v3.pt', steps: int = 300, data: str = 'data/train,data/train2',
          lr: float = 2e-5, batch_s: float = 60.0, parts: int = 40, workers: int = 0, local: int = 0, extra: str = ''):
    """extra: more train.py options, e.g. '--mix 0.4,0.4,0.2 --max_per 0.06 --mosaic_p 0.15' (v5)."""
    args = ['--init', f'/vol/models/{init}', '--out', f'/vol/models/{out}', '--steps', str(steps), '--data', data,
            '--lr', str(lr), '--batch_s', str(batch_s), '--voice_p', '0.4', '--chan_p', '0.35', '--fmask', '0.3'] + extra.split()
    for k in range(parts):  # each call is under an hour; it carries on from last.pt
        r = train_part.remote(args, workers, local)
        print(f'part {k + 1}: {r}', flush=True)
        if r == 'done':
            break


@app.local_entrypoint()
def teacher(out: str = 'teacher', steps: int = 30000, data: str = 'data/train,data/train2,data/train3,data/train4',
            parts: int = 1, extra: str = ''):
    """parts calls of teacher_part (each under an hour, carrying on from last.pt); the shell script calls this one part
    at a time so it can check the spend between parts."""
    args = ['--out', f'/vol/models/{out}', '--steps', str(steps), '--data', data] + extra.split()
    for k in range(parts):
        r = teacher_part.remote(args)
        print(f'part {k + 1}: {r}', flush=True)
        if r == 'done':
            break


@app.local_entrypoint()
def distil(out: str = 'ft-v6', init: str = '', teacher: str = 'teacher/teacher.pt', steps: int = 30000,
           data: str = 'data/train,data/train2,data/train3,data/train4', parts: int = 1, extra: str = ''):
    """The student distilled from the teacher, parts calls at a time (the shell script checks the spend between).
    init: a checkpoint on the volume to start from; empty starts from the released model (better at words than v5)."""
    args = (['--init', f'/vol/models/{init}'] if init else []) + ['--out', f'/vol/models/{out}', '--steps', str(steps), '--data', data,
            '--teacher', f'/vol/models/{teacher}', '--lr', '2e-5', '--batch_s', '60', '--voice_p', '0.4',
            '--chan_p', '0.35', '--fmask', '0.3'] + extra.split()
    for k in range(parts):
        r = distil_part.remote(args)
        print(f'part {k + 1}: {r}', flush=True)
        if r == 'done':
            break


@app.local_entrypoint()
def fetch_model(out: str = 'ft-v4', only: str = ''):
    d = LAB / 'models' / out
    d.mkdir(parents=True, exist_ok=True)
    files = [only] if only else [n for n in listing.remote(f'models/{out}') if n.endswith('.pt') or n == 'log.txt']
    for f in files:
        subprocess.run([sys.executable, '-m', 'modal', 'volume', 'get', '--force', 'revisely-lab', f'/models/{out}/{f}',
                        str(d / f)], check=True)
    print('downloaded to', d, files)
