#!/usr/bin/env python3
"""The teacher (Nov 14 2026): Muaalem (obadx/muaalem-model-v3_2: w2v-BERT 2.0, 0.6B parameters, Quran Muaalem
License) fine-tuned on the same training data and slips as the students (train.py's Data and Batches: Muaalem's
shards, Tadabur, Tarteel's users, tlog; planted slips, other voices, a phone in a room, stitched ayat), with its own
features (its processor) and loss (CTC on the phoneme head; HisnLabs' 42 sounds are Muaalem's, same symbols).
The small model the service runs is then distilled from it.

Run on Modal in parts of under an hour (modal_batch.py::teacher), each carrying on from <out>/last.pt.

  python teacher_train.py --data data/train,data/train2,data/train3,data/train4 --steps 30000 --out $LAB/models/teacher
"""
import argparse
import json
import math
import os
import pathlib
import random
import sys
import time

import numpy as np
import torch

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
import train  # noqa: E402  (Data, Batches)
import checker  # noqa: E402

MODEL = 'obadx/muaalem-model-v3_2'
PROC = {}


def load(device, init=None):
    from quran_muaalem.modeling.modeling_multi_level_ctc import Wav2Vec2BertForMultilevelCTC
    from transformers import AutoFeatureExtractor
    from quran_muaalem.modeling.multi_level_tokenizer import MultiLevelTokenizer
    cache = os.environ.get('HF_HOME')
    m = Wav2Vec2BertForMultilevelCTC.from_pretrained(MODEL, cache_dir=cache)
    if init:
        sd = torch.load(init, map_location='cpu')
        m.load_state_dict(sd.get('model', sd))
    PROC['p'] = AutoFeatureExtractor.from_pretrained(MODEL, cache_dir=cache)
    tok = MultiLevelTokenizer(MODEL)
    hv = json.loads((LAB / 'models/hisnlabs-tajweed-v2/config.json').read_text())['phonemes']
    v2i = {v: int(i) for i, v in tok.id_to_vocab['phonemes'].items()}
    PROC['map'] = np.array([0] + [v2i[p] for p in hv], np.int64)  # HisnLabs label (1-based) -> Muaalem id
    return m.to(device)


def build_features(items, fmask=0.0, rng=None):
    """train.Batches' batch builder, for Muaalem: its features for the audio, labels in its ids (padded -100)."""
    xs = [x for x, _ in items]
    f = PROC['p'](xs, sampling_rate=16000, return_tensors='np', padding=True)
    labs = [PROC['map'][np.asarray(lab, np.int64)] for _, lab in items]
    L = max(len(l) for l in labs)
    lab_arr = np.full((len(labs), L), -100, np.int64)
    for k, l in enumerate(labs):
        lab_arr[k, :len(l)] = l
    return {'input_features': f['input_features'].astype(np.float32), 'attention_mask': f['attention_mask']}, \
        [len(x) for x in xs], lab_arr


def per(model, data, items, device, rng):
    """Greedy phoneme error on held-out clips (as recited, no slips)."""
    import Levenshtein
    model.eval()
    errs, n = 0, 0
    with torch.no_grad():
        for k in range(0, len(items), 8):
            batch = [data.clip(*it)[:2] for it in items[k:k + 8]]
            feats, _, lab = build_features(batch)
            with torch.autocast(device.split(':')[0], dtype=torch.bfloat16, enabled=device.startswith('cuda')):
                out = model(input_features=torch.as_tensor(feats['input_features']).to(device),
                            attention_mask=torch.as_tensor(feats['attention_mask']).to(device), return_dict=True)
            lg = out.logits['phonemes'] if isinstance(out.logits, dict) else out.logits
            am = lg.float().argmax(-1).cpu().numpy()
            for b in range(len(batch)):
                seq = [int(c) for i, c in enumerate(am[b]) if c != 0 and (i == 0 or am[b][i - 1] != c)]
                ref = [int(c) for c in lab[b] if c >= 0]
                errs += Levenshtein.distance(''.join(map(chr, seq)), ''.join(map(chr, ref)))
                n += len(ref)
    model.train()
    return errs / max(n, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--steps', type=int, default=30000)
    ap.add_argument('--batch_s', type=float, default=96.0, help='seconds of audio per batch')
    ap.add_argument('--lr', type=float, default=1e-5)
    ap.add_argument('--warmup', type=int, default=1000)
    ap.add_argument('--slip_p', type=float, default=0.5)
    ap.add_argument('--voice_p', type=float, default=0.3)
    ap.add_argument('--chan_p', type=float, default=0.35)
    ap.add_argument('--fmask', type=float, default=0.0)
    ap.add_argument('--mosaic_p', type=float, default=0.15)
    ap.add_argument('--data', default='data/train,data/train2,data/train3,data/train4')
    ap.add_argument('--mix', default='')
    ap.add_argument('--max_per', type=float, default=0.06)
    ap.add_argument('--out', default=str(LAB / 'models/teacher'))
    ap.add_argument('--init', default=None)
    ap.add_argument('--device', default='cuda')
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--resume', type=int, default=1)
    ap.add_argument('--max_minutes', type=float, default=0)
    ap.add_argument('--max_clips', type=int, default=0)
    ap.add_argument('--ckpt', type=int, default=1, help='gradient checkpointing (about 27% slower, a third of the memory)')
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    t_start = time.time()
    torch.manual_seed(0)
    data = train.Data(dirs=tuple(a.data.split(',')), max_per=a.max_per)
    if a.max_clips:
        data.train = data.train[:a.max_clips]
    model = load(a.device, a.init)
    if a.ckpt:  # clips run to 30 s and attention grows with the square of the length: without it a batch filled 44 GB
        model.gradient_checkpointing_enable()
    V = json.loads((LAB / 'models/hisnlabs-tajweed-v2/config.json').read_text())['phonemes']
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    step = 0
    last = out / 'last.pt'
    if a.resume and last.exists():
        st = torch.load(last, map_location='cpu')
        model.load_state_dict(st['model'])
        opt.load_state_dict(st['opt'])
        step = st['step']
        print(f'resumed at step {step}', flush=True)
    if step >= a.steps:
        return 'done'
    sched = lambda s: min(1.0, (s + 1) / a.warmup) * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * min(1.0, s / a.steps))))  # noqa: E731
    train.build_mels = build_features  # Batches builds Muaalem's features
    ds = train.Batches(data, a, V, seed=step + 1)
    dl = torch.utils.data.DataLoader(ds, batch_size=None, num_workers=a.workers, persistent_workers=a.workers > 0,
                                     prefetch_factor=4 if a.workers else None)
    rng = random.Random(0)
    val = rng.sample(data.val, min(160, len(data.val)))
    model.train()
    log = open(out / 'log.txt', 'a')
    t0, losses = time.time(), []
    for feats, _, labs, seen, _tf in dl:
        for g in opt.param_groups:
            g['lr'] = a.lr * sched(step)
        x = torch.as_tensor(feats['input_features']).to(a.device)
        mask = torch.as_tensor(feats['attention_mask']).to(a.device)
        y = {'phonemes': torch.as_tensor(labs).to(a.device)}
        with torch.autocast('cuda', dtype=torch.bfloat16):
            o = model(input_features=x, attention_mask=mask, labels=y, return_dict=True)
        loss = o.loss
        if not torch.isfinite(loss):
            opt.zero_grad(set_to_none=True)
            continue
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        opt.zero_grad(set_to_none=True)
        losses.append(float(loss))
        step += 1
        if step % 200 == 0:
            msg = f'step {step} loss {np.mean(losses):.3f} lr {a.lr * sched(step):.2e} {(time.time() - t0) / 200:.2f}s/step'
            print(msg, flush=True)
            log.write(msg + '\n'); log.flush()
            losses, t0 = [], time.time()
        if step % 4000 == 0 or step >= a.steps:
            p = per(model, data, val, a.device, rng)
            msg = f'step {step} held-out phoneme error {p:.4f}'
            print(msg, flush=True)
            log.write(msg + '\n'); log.flush()
            torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'step': step}, last)
        if step >= a.steps:
            torch.save(model.state_dict(), out / 'teacher.pt')
            return 'done'
        if a.max_minutes and time.time() - t_start > a.max_minutes * 60:
            torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'step': step}, last)
            return f'paused at step {step}'
    return f'stopped at step {step}'


if __name__ == '__main__':
    print(main())
