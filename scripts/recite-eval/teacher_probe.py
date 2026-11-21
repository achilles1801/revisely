"""How fast, and so how dear, a full-size teacher would train: Muaalem (obadx/muaalem-model-v3_2, w2v-BERT 2.0,
0.6B parameters, Quran Muaalem License) fine-tuned with AdamW in bf16 on Modal GPUs. Random audio of a real
recitation's length and random phoneme targets: the timing is the model's, not the data's. Nothing is kept.

Lab only, `modal run` (never deployed); the owner's Modal rules in modal_batch.py apply (one GPU per function, two at
once, under an hour each).

  modal run teacher_probe.py          -> runs/teacher-probe.json
"""
import json
import os
import pathlib
import time

import modal

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
app = modal.App('revisely-lab-teacher-probe')
image = (modal.Image.debian_slim(python_version='3.12')
         .apt_install('libsndfile1')
         .pip_install('torch==2.15.0', 'transformers==4.57.6', 'quran-muaalem==0.3.0', 'numpy', 'soundfile',
                      'huggingface_hub'))
SECS, BATCH, STEPS, WARM = 12.0, 8, 20, 5


def probe(gpu_name, checkpointing):
    import numpy as np
    import torch
    from quran_muaalem import Muaalem
    t_load = time.time()
    m = Muaalem(device='cuda', dtype=torch.float32)
    model, proc = m.model, m.processor
    load_s = time.time() - t_load
    model.train()
    if checkpointing:
        model.gradient_checkpointing_enable()
    n_params = sum(p.numel() for p in model.parameters())
    vocab = model.config.level_to_vocab_size['phonemes']
    rng = np.random.default_rng(0)
    audio = [rng.standard_normal(int(SECS * 16000)).astype(np.float32) * 0.05 for _ in range(BATCH)]
    f = proc(audio, sampling_rate=16000, return_tensors='pt')
    f = {k: v.to('cuda') for k, v in f.items()}
    labels = {'phonemes': torch.randint(1, vocab, (BATCH, int(SECS * 12)), device='cuda')}
    opt = torch.optim.AdamW(model.parameters(), lr=1e-5)
    torch.cuda.reset_peak_memory_stats()
    times = []
    for k in range(WARM + STEPS):
        torch.cuda.synchronize()
        t0 = time.time()
        with torch.autocast('cuda', dtype=torch.bfloat16):
            out = model(**f, labels=labels, return_dict=True)
        out.loss.backward()
        opt.step()
        opt.zero_grad(set_to_none=True)
        torch.cuda.synchronize()
        if k >= WARM:
            times.append(time.time() - t0)
    model.eval()
    with torch.no_grad(), torch.autocast('cuda', dtype=torch.bfloat16):
        torch.cuda.synchronize()
        t0 = time.time()
        for _ in range(5):
            model(**f, return_dict=True)
        torch.cuda.synchronize()
        infer = (time.time() - t0) / 5
    step = float(np.median(times))
    return {
        'gpu': gpu_name, 'checkpointing': checkpointing, 'params_m': round(n_params / 1e6),
        'batch': BATCH, 'secs_per_clip': SECS, 'step_s': round(step, 3),
        'audio_hours_per_gpu_hour': round(BATCH * SECS / step, 1),
        'infer_audio_s_per_s': round(BATCH * SECS / infer, 1),
        'peak_gb': round(torch.cuda.max_memory_allocated() / 1e9, 1), 'load_s': round(load_s),
    }


@app.function(image=image, gpu='A10G', timeout=1800)
def on_a10g():
    out = []
    for ck in (False, True):
        try:
            out.append(probe('A10G', ck))
        except Exception as e:  # out of memory without checkpointing, say
            out.append({'gpu': 'A10G', 'checkpointing': ck, 'error': repr(e)[:300]})
    return out


@app.function(image=image, gpu='L40S', timeout=1800)
def on_l40s():
    out = []
    for ck in (False, True):
        try:
            out.append(probe('L40S', ck))
        except Exception as e:
            out.append({'gpu': 'L40S', 'checkpointing': ck, 'error': repr(e)[:300]})
    return out


@app.local_entrypoint()
def main():
    a, b = on_a10g.spawn(), on_l40s.spawn()
    res = a.get() + b.get()
    (LAB / 'runs/teacher-probe.json').write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))
