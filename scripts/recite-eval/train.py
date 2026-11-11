#!/usr/bin/env python3
"""Fine-tune the small model (HisnLabs tajweed-v2, 20M) on the Mac to hear slips, not just the expected sounds.

Training clips: Muaalem's dataset (MIT; 12 moshafs of reciters not in our tests), half as recited, half with
1–3 planted slips (augment.py) and their labels changed to match. Loss: CTC on the phoneme head only (the sifat
heads are left as they were). A small slice of each shard is kept back to check that plain recitation is still
heard as well as before.

  python train.py --steps 3000 --out $LAB/models/ft-v1      # on the Mac's GPU (MPS)

v3 adds --data data/train,data/train2: Tadabur's reciters (tadabur_fetch.py, tadabur_label.py) beside Muaalem's.

v5 (Nov 11 2026): v4 heard the expected word where a learner swapped one consonant (وَمَا for فَمَا). Its data was
about 85% Tadabur: always-correct recitation, labelled automatically. So --max_per keeps only Tadabur ayat the
labels fit closely, --mix draws each folder's share of clips (Muaalem's hand-checked labels as often as Tadabur's),
augment's new swap slip changes any consonant, and --mosaic_p stitches clips from stretches of several ayat.

v2 adds (voices.py, augment.channel): women's and children's voices made from the same clips (--voice_p), a phone
in a room (reverb, the microphone's band, babble or noise; --chan_p), masked mel bands (--fmask), and can start from
an earlier fine-tune (--init).
"""
import argparse, math, os, pathlib, pickle, random, sys, time, json
import numpy as np
import torch, torch.nn.functional as F

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
import augment, hisn_torch, checker  # noqa: E402


class Data:
    def __init__(self, held=0.03, seed=0, dirs=('data/train',), max_per=None):
        self.shards, self.dir_of = [], []
        for d in dirs:
            for mp in sorted((LAB / d).glob('*.meta.pkl')):
                name = mp.name[:-len('.meta.pkl')]
                if name.endswith('.voice'):
                    continue
                metas = pickle.load(open(mp, 'rb'))
                vp = LAB / d / f'{name}.voice.audio.npy'
                self.shards.append((name, metas, LAB / d / f'{name}.audio.npy', vp if vp.exists() else None))
                self.dir_of.append(dirs.index(d))
        rng = random.Random(seed)
        self.train, self.val = [], []
        for si, (_, metas, _, _) in enumerate(self.shards):
            for mi, m in enumerate(metas):
                if m['fit'] < -1.5:  # the current model and the label disagree badly: likely a bad label
                    continue
                if max_per is not None and m.get('per', 0.0) > max_per:  # automatic labels only: too far from what was heard
                    continue
                (self.val if rng.random() < held else self.train).append((si, mi))

    # The audio stays on disk: each process opens the files itself, memory-mapped, the first time it reads them.
    # Never hand the arrays to another process: a Mac starts data workers fresh and would copy every array whole
    # (35 GB on Nov 10, which filled the Mac's memory and restarted it).
    def _open(self, path):
        if path is None:
            return None
        cache = self.__dict__.setdefault('_mm', {})
        if path not in cache:
            cache[path] = np.load(path, mmap_mode='r')
        return cache[path]

    def __getstate__(self):
        st = dict(self.__dict__)
        st.pop('_mm', None)
        return st

    def clip(self, si, mi, voice=False):
        _, metas, apath, vpath = self.shards[si]
        m = metas[mi]
        src = self._open(vpath) if (voice and vpath is not None) else self._open(apath)
        return src[m['off']:m['off'] + m['n']].astype(np.float32) / 32768.0, list(m['labels']), m['emit']


def build_mels(items, fmask=0.0, rng=None):
    """items [(audio, labels)] -> (mels [B, 80, T] float32, frames, labels): the CPU part of a batch."""
    mels, labs, frames = [], [], []
    for x, lab in items:
        mel = hisn_torch.mel_of(x)
        if fmask and rng is not None and rng.random() < fmask:  # mask one or two mel bands (never time: slips live there)
            mel = mel.copy()
            for _ in range(int(rng.integers(1, 3))):
                w = int(rng.integers(2, 9)); f0 = int(rng.integers(0, 80 - w)); mel[f0:f0 + w] = mel.mean()
        mels.append(mel); labs.append(lab); frames.append(mel.shape[1])
    T = max(frames)
    M = np.zeros((len(items), 80, T), np.float32)
    for k, m in enumerate(mels):
        M[k, :, :m.shape[1]] = m
        M[k, :, m.shape[1]:] = m.min()
    return M, frames, labs


def to_device(M, frames, labs, device):
    tgt = torch.tensor([l for lab in labs for l in lab], dtype=torch.long)
    tl = torch.tensor([len(l) for l in labs], dtype=torch.long)
    fr = torch.tensor(frames, dtype=torch.long)
    return torch.as_tensor(M).to(device), fr.to(device), tgt, tl


def batch_tensors(items, device, fmask=0.0, rng=None):
    return to_device(*build_mels(items, fmask, rng), device)


class Batches(torch.utils.data.IterableDataset):
    """Training batches (about batch_s seconds of audio each): clips in a shuffled order, some in another voice,
    half with planted slips, some through a phone in a room. Each data worker has its own order and random seed."""

    def __init__(self, data, a, V, seed):
        self.data, self.a, self.V, self.seed = data, a, V, seed

    def __iter__(self):
        info = torch.utils.data.get_worker_info()
        wid = info.id if info else 0
        a, data, V = self.a, self.data, self.V
        rng = np.random.default_rng(self.seed * 1009 + wid)
        shuf = random.Random(self.seed * 1009 + wid)
        ndir = max(data.dir_of) + 1 if data.dir_of else 1
        orders = [[k for k, (si, _) in enumerate(data.train) if data.dir_of[si] == d] for d in range(ndir)]
        for o in orders:
            shuf.shuffle(o)
        mix = [float(w) for w in a.mix.split(',')] if a.mix else [len(o) for o in orders]
        mix = np.array([w if orders[d] else 0.0 for d, w in enumerate(mix[:ndir])], float)
        mix /= mix.sum()
        by_shard = {}
        for k, (si, _) in enumerate(data.train):
            by_shard.setdefault(si, []).append(k)
        pos, babble = [0] * ndir, []
        while True:
            items, secs, seen = [], 0.0, {}
            while secs < a.batch_s:
                d = int(rng.choice(ndir, p=mix))
                si, mi = data.train[orders[d][pos[d] % len(orders[d])]]; pos[d] += 1
                use_voice = rng.random() < a.voice_p
                if a.mosaic_p and rng.random() < a.mosaic_p:
                    ks = rng.choice(by_shard[si], size=min(len(by_shard[si]), int(rng.integers(2, 5))), replace=False)
                    # stretches of 12–40 sounds: in shorter ones even the released model loses its way (aug_check.py)
                    r = augment.mosaic([data.clip(*data.train[k], voice=use_voice) for k in ks], V, rng, min_len=12, max_len=40)
                    if r is not None:
                        x, lab = r
                        seen['mosaic'] = seen.get('mosaic', 0) + 1
                        if rng.random() < a.chan_p:
                            x = augment.channel(x, rng, babble)
                        if len(x) >= 16000:
                            items.append((x, lab)); secs += len(x) / 16000
                        continue
                x, lab, emit = data.clip(si, mi, voice=use_voice)
                if not use_voice:
                    babble.append(x); babble[:] = babble[-24:]
                if rng.random() < a.slip_p:
                    x, lab, whats = augment.plant(x, lab, emit, V, rng, n_slips=int(rng.integers(1, 4)), null_p=0.3)
                    for w in whats:
                        k = w.split(' ')[0] if w[0] not in 'ابتثجحخدذرزسشصضطظعغفقكلمنهويءَُِ' else 'letter/haraka'
                        seen[k] = seen.get(k, 0) + 1
                elif rng.random() < 0.3:
                    x, lab, _ = augment.plant(x, lab, emit, V, rng, n_slips=0, null_p=1.0)
                if not lab or len(x) < 16000:
                    continue
                if rng.random() < a.chan_p:
                    x = augment.channel(x, rng, babble)
                else:
                    x = np.clip(x * rng.uniform(0.5, 1.5), -1, 1).astype(np.float32)
                items.append((x, lab)); secs += len(x) / 16000
            M, frames, labs = build_mels(items, a.fmask, rng)
            yield M, frames, labs, seen


def per(model, data, items, device, rng, voice=False, chan=False):
    import Levenshtein
    V = json.loads((hisn_torch.MODEL / 'config.json').read_text())['phonemes']
    e = n = 0
    model.eval()
    with torch.no_grad():
        for si, mi in items:
            x, lab, _ = data.clip(si, mi, voice=voice)
            if chan:
                x = augment.channel(x, np.random.default_rng(si * 100003 + mi))
            mel = torch.from_numpy(hisn_torch.mel_of(x))[None].to(device)
            lp = torch.log_softmax(model(mel)['phonemes'][0].float(), -1).cpu().numpy()
            h = ''.join(V[k - 1] for k, _, _ in checker.heard_tokens(lp))
            ref = ''.join(V[l - 1] for l in lab)
            e += Levenshtein.distance(ref, h); n += len(ref)
    model.train()
    return e / max(n, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--steps', type=int, default=3000)
    ap.add_argument('--batch_s', type=float, default=60.0, help='seconds of audio per batch')
    ap.add_argument('--lr', type=float, default=3e-5)
    ap.add_argument('--slip_p', type=float, default=0.5)
    ap.add_argument('--out', default=str(LAB / 'models/ft-v1'))
    ap.add_argument('--device', default='mps')
    ap.add_argument('--freeze_conv', type=int, default=1)
    ap.add_argument('--init', default=None, help='checkpoint to start from (default: HisnLabs as released)')
    ap.add_argument('--voice_p', type=float, default=0.0, help="share of clips in a woman's or child's voice")
    ap.add_argument('--chan_p', type=float, default=0.0, help='share of clips through a phone in a room')
    ap.add_argument('--fmask', type=float, default=0.0)
    ap.add_argument('--data', default='data/train', help='comma-separated folders of shards (data/train: Muaalem, data/train2: Tadabur, data/train3: Tarteel users)')
    ap.add_argument('--workers', type=int, default=0, help='processes building batches (0: in the training process)')
    ap.add_argument('--resume', type=int, default=0, help='carry on from <out>/last.pt if it is there')
    ap.add_argument('--max_minutes', type=float, default=0, help='save <out>/last.pt and stop after this long (0: run to the end)')
    ap.add_argument('--max_clips', type=int, default=0, help='use only this many training clips (local tests: a few hundred)')
    ap.add_argument('--max_per', type=float, default=None, help='drop automatically labelled clips whose labels differ from what was heard by more than this share')
    ap.add_argument('--mix', default='', help="each --data folder's share of clips, e.g. 0.5,0.5 (default: by size)")
    ap.add_argument('--mosaic_p', type=float, default=0.0, help='share of clips stitched from stretches of several ayat')
    a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(0)
    rng = np.random.default_rng(0)
    data = Data(dirs=a.data.split(','), max_per=a.max_per)
    if a.max_clips:
        data.train = random.Random(2).sample(data.train, min(a.max_clips, len(data.train)))
        data.val = data.val[:min(len(data.val), 50)]
    elif a.device in ('mps', 'cpu') and sys.platform == 'darwin' and a.workers > 1:
        sys.exit('on the Mac: full-data runs go to Modal; a local test uses --max_clips (a few hundred) and --workers 0 or 1')
    V = json.loads((hisn_torch.MODEL / 'config.json').read_text())['phonemes']
    print(f'{len(data.train)} training clips, {len(data.val)} held back, {len(data.shards)} shards', flush=True)
    model = hisn_torch.load(a.init, device=a.device).train()
    for name, p in model.named_parameters():
        p.requires_grad = name.startswith('enc.') or name.startswith('heads.phonemes')
        if a.freeze_conv and (name.startswith('enc.conv') or name.startswith('enc.embed_positions')):
            p.requires_grad = False
    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.01)
    warm = 200
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(s, a.steps) / a.steps)))
    val_items = data.val[:150]
    base_per = per(model, data, val_items, a.device, rng)
    print(f'held-back plain recitation, phoneme errors before: {100*base_per:.2f}%', flush=True)
    hard = a.voice_p > 0 or a.chan_p > 0
    base_vc = None
    if hard:
        base_vc = (per(model, data, val_items, a.device, rng, voice=True), per(model, data, val_items, a.device, rng, voice=True, chan=True))
        print(f'  in other voices {100*base_vc[0]:.2f}%, other voices on a phone in a room {100*base_vc[1]:.2f}%', flush=True)
    log = open(out / 'log.txt', 'a')
    first, slips_seen, t_start = 1, {}, time.time()
    if a.resume and (out / 'last.pt').exists():
        ck = torch.load(out / 'last.pt', map_location='cpu')
        model.load_state_dict(ck['model']); opt.load_state_dict(ck['opt']); sched.load_state_dict(ck['sched'])
        first, slips_seen = ck['step'] + 1, ck.get('slips', {})
        base_per, base_vc = ck.get('base_per', base_per), ck.get('base_vc', base_vc if hard else None)
        print(f'carrying on from step {ck["step"]}', flush=True)
    def save_last(step):
        torch.save({'model': {k: v_.detach().cpu() for k, v_ in model.state_dict().items()}, 'opt': opt.state_dict(),
                    'sched': sched.state_dict(), 'step': step, 'slips': slips_seen, 'base_per': base_per,
                    'base_vc': base_vc if hard else None}, out / 'last.pt.tmp')
        os.replace(out / 'last.pt.tmp', out / 'last.pt')
    ds = Batches(data, a, V, seed=first)
    def _one_thread(_):  # each data worker on one core: several workers each spawning threads only fight
        torch.set_num_threads(1)
        os.environ['OMP_NUM_THREADS'] = '1'
    it = iter(torch.utils.data.DataLoader(ds, batch_size=None, num_workers=a.workers, prefetch_factor=4,
                                          worker_init_fn=_one_thread, persistent_workers=False) if a.workers else ds)
    t0, tot, cnt, t_wait = time.time(), 0.0, 0, 0.0
    for step in range(first, a.steps + 1):
        tw = time.time()
        M, frames, labs, seen = next(it)
        t_wait += time.time() - tw
        for k, v_ in seen.items():
            slips_seen[k] = slips_seen.get(k, 0) + v_
        mel, fr, tgt, tl = to_device(np.asarray(M), list(frames), labs, a.device)
        if a.device == 'cuda':  # bfloat16 on the GPU; the loss is computed in float32 below
            with torch.autocast('cuda', dtype=torch.bfloat16):
                out_ = model(mel, fr)
        else:
            out_ = model(mel, fr)
        lp = F.log_softmax(out_['phonemes'].float(), -1).transpose(0, 1)  # [T, B, V]
        il = ((fr + 1) // 2 - 1).clamp(max=lp.shape[0]).cpu()
        if a.device == 'cuda':
            loss = F.ctc_loss(lp, tgt.cuda(), il.cuda(), tl.cuda(), blank=0, reduction='mean', zero_infinity=True)
        else:
            loss = F.ctc_loss(lp.cpu(), tgt, il, tl, blank=0, reduction='mean', zero_infinity=True)
        opt.zero_grad(); loss.backward()
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step(); sched.step()
        tot += float(loss.detach()); cnt += 1
        del out_, lp, loss, mel
        if step % 50 == 0:
            if a.device == 'mps':
                torch.mps.empty_cache()
            msg = f'step {step} loss {tot/cnt:.4f} lr {sched.get_last_lr()[0]:.2e} {time.time()-t0:.0f}s (waiting for data {t_wait:.0f}s)'
            print(msg, flush=True); log.write(msg + '\n'); log.flush(); tot = cnt = 0
        if step % 500 == 0 or step == a.steps:
            v = per(model, data, val_items, a.device, rng)
            msg = f'step {step}: held-back plain recitation phoneme errors {100*v:.2f}% (before {100*base_per:.2f}%); slips planted so far {slips_seen}'
            if hard:
                vv = per(model, data, val_items, a.device, rng, voice=True); vc = per(model, data, val_items, a.device, rng, voice=True, chan=True)
                msg += f'; other voices {100*vv:.2f}% (before {100*base_vc[0]:.2f}%), on a phone in a room {100*vc:.2f}% (before {100*base_vc[1]:.2f}%)'
            print(msg, flush=True); log.write(msg + '\n'); log.flush()
            torch.save({k: v_.detach().cpu() for k, v_ in model.state_dict().items()}, out / f'step{step}.pt')
            save_last(step)
        if a.max_minutes and time.time() - t_start > a.max_minutes * 60:
            save_last(step)
            print(f'paused at step {step}', flush=True)
            return 'paused'
    save_last(a.steps)
    (out / 'done').write_text(str(a.steps))
    return 'done'


if __name__ == '__main__':
    main()
