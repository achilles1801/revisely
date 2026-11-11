#!/usr/bin/env python3
"""Fine-tune the small model (HisnLabs tajweed-v2, 20M) on the Mac to hear slips, not just the expected sounds.

Training clips: Muaalem's dataset (MIT; 12 moshafs of reciters not in our tests), half as recited, half with
1–3 planted slips (augment.py) and their labels changed to match. Loss: CTC on the phoneme head only (the sifat
heads are left as they were). A small slice of each shard is kept back to check that plain recitation is still
heard as well as before.

  python train.py --steps 3000 --out $LAB/models/ft-v1      # on the Mac's GPU (MPS)

v3 adds --data data/train,data/train2: Tadabur's reciters (tadabur_fetch.py, tadabur_label.py) beside Muaalem's.

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
    def __init__(self, held=0.03, seed=0, dirs=('data/train',)):
        self.shards = []
        for d in dirs:
            for mp in sorted((LAB / d).glob('*.meta.pkl')):
                name = mp.name[:-len('.meta.pkl')]
                if name.endswith('.voice'):
                    continue
                metas = pickle.load(open(mp, 'rb'))
                audio = np.load(LAB / d / f'{name}.audio.npy', mmap_mode='r')
                vp = LAB / d / f'{name}.voice.audio.npy'
                voice = np.load(vp, mmap_mode='r') if vp.exists() else None
                self.shards.append((name, metas, audio, voice))
        rng = random.Random(seed)
        self.train, self.val = [], []
        for si, (_, metas, _, _) in enumerate(self.shards):
            for mi, m in enumerate(metas):
                if m['fit'] < -1.5:  # the current model and the label disagree badly: likely a bad label
                    continue
                (self.val if rng.random() < held else self.train).append((si, mi))

    def clip(self, si, mi, voice=False):
        _, metas, audio, va = self.shards[si]
        m = metas[mi]
        src = va if (voice and va is not None) else audio
        return src[m['off']:m['off'] + m['n']].astype(np.float32) / 32768.0, list(m['labels']), m['emit']


def batch_tensors(items, device, fmask=0.0, rng=None):
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
    tgt = torch.tensor([l for lab in labs for l in lab], dtype=torch.long)
    tl = torch.tensor([len(l) for l in labs], dtype=torch.long)
    fr = torch.tensor(frames, dtype=torch.long)
    return torch.from_numpy(M).to(device), fr.to(device), tgt, tl


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
    ap.add_argument('--data', default='data/train', help='comma-separated folders of shards (data/train: Muaalem, data/train2: Tadabur)')
    a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(0)
    rng = np.random.default_rng(0)
    data = Data(dirs=a.data.split(','))
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
    if hard:
        base_vc = (per(model, data, val_items, a.device, rng, voice=True), per(model, data, val_items, a.device, rng, voice=True, chan=True))
        print(f'  in other voices {100*base_vc[0]:.2f}%, other voices on a phone in a room {100*base_vc[1]:.2f}%', flush=True)
    babble = []
    log = open(out / 'log.txt', 'a')
    order = list(range(len(data.train)))
    random.Random(1).shuffle(order)
    pos, t0, tot, cnt, slips_seen = 0, time.time(), 0.0, 0, {}
    for step in range(1, a.steps + 1):
        items, secs = [], 0.0
        while secs < a.batch_s:
            si, mi = data.train[order[pos % len(order)]]; pos += 1
            use_voice = rng.random() < a.voice_p
            x, lab, emit = data.clip(si, mi, voice=use_voice)
            if not use_voice:
                babble.append(x); babble[:] = babble[-24:]
            if rng.random() < a.slip_p:
                x, lab, whats = augment.plant(x, lab, emit, V, rng, n_slips=int(rng.integers(1, 4)), null_p=0.3)
                for w in whats:
                    k = w.split(' ')[0] if w[0] not in 'ابتثجحخدذرزسشصضطظعغفقكلمنهويءَُِ' else 'letter/haraka'
                    slips_seen[k] = slips_seen.get(k, 0) + 1
            elif rng.random() < 0.3:
                x, lab, _ = augment.plant(x, lab, emit, V, rng, n_slips=0, null_p=1.0)
            if not lab or len(x) < 16000:
                continue
            if rng.random() < a.chan_p:
                x = augment.channel(x, rng, babble)
            else:
                x = np.clip(x * rng.uniform(0.5, 1.5), -1, 1).astype(np.float32)
            items.append((x, lab)); secs += len(x) / 16000
        mel, fr, tgt, tl = batch_tensors(items, a.device, a.fmask, rng)
        out_ = model(mel, fr)
        lp = F.log_softmax(out_['phonemes'].float(), -1).transpose(0, 1)  # [T, B, V]
        il = ((fr + 1) // 2 - 1).clamp(max=lp.shape[0]).cpu()
        loss = F.ctc_loss(lp.cpu(), tgt, il, tl, blank=0, reduction='mean', zero_infinity=True)
        opt.zero_grad(); loss.backward()
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step(); sched.step()
        tot += float(loss.detach()); cnt += 1
        del out_, lp, loss, mel
        if step % 50 == 0:
            if a.device == 'mps':
                torch.mps.empty_cache()
            msg = f'step {step} loss {tot/cnt:.4f} lr {sched.get_last_lr()[0]:.2e} {time.time()-t0:.0f}s'
            print(msg, flush=True); log.write(msg + '\n'); log.flush(); tot = cnt = 0
        if step % 500 == 0 or step == a.steps:
            v = per(model, data, val_items, a.device, rng)
            msg = f'step {step}: held-back plain recitation phoneme errors {100*v:.2f}% (before {100*base_per:.2f}%); slips planted so far {slips_seen}'
            if hard:
                vv = per(model, data, val_items, a.device, rng, voice=True); vc = per(model, data, val_items, a.device, rng, voice=True, chan=True)
                msg += f'; other voices {100*vv:.2f}% (before {100*base_vc[0]:.2f}%), on a phone in a room {100*vc:.2f}% (before {100*base_vc[1]:.2f}%)'
            print(msg, flush=True); log.write(msg + '\n'); log.flush()
            torch.save({k: v_.detach().cpu() for k, v_ in model.state_dict().items()}, out / f'step{step}.pt')


if __name__ == '__main__':
    main()
