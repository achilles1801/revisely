"""HisnLabs tajweed-v2 in PyTorch (model.safetensors, Apache-2.0), to fine-tune it and to run a fine-tuned copy.

The phoneme head gives the same 43 log-probabilities as the int8 ONNX export (blank first); the 10 sifat heads
(ghonna, qalqla, ...) come too. HisnLabs' own inference pads 0.4 s of silence either side: its training clips
start and end with silence.
"""
import json
import os
import pathlib
import sys

import numpy as np
import torch

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
MODEL = LAB / 'models/hisnlabs-tajweed-v2'
sys.path.insert(0, str(MODEL))
sys.path.insert(0, str(HERE))
LEAD = 0.4


def build():
    from transformers import WhisperConfig
    from transformers.models.whisper.modeling_whisper import WhisperEncoder
    import modeling
    cfg = WhisperConfig(d_model=512, encoder_layers=6, encoder_attention_heads=8, encoder_ffn_dim=2048, num_mel_bins=80,
                        max_source_positions=1500, decoder_layers=6, decoder_attention_heads=8, decoder_ffn_dim=2048)
    cfg._attn_implementation = 'eager'
    return modeling.HifzStudent(WhisperEncoder(cfg))


def load(path=None, device='cpu'):
    from safetensors.torch import load_file
    m = build()
    path = pathlib.Path(path) if path else MODEL / 'model.safetensors'
    sd = load_file(str(path)) if path.suffix == '.safetensors' else torch.load(path, map_location='cpu')
    missing, extra = m.load_state_dict(sd, strict=False)
    assert not [k for k in missing if not k.startswith('riwaya')] and not extra, (missing, extra)
    return m.to(device).eval()


def mel_of(x, pad=LEAD):
    import checker
    if pad:
        z = np.zeros(int(16000 * pad), np.float32)
        x = np.concatenate([z, x.astype(np.float32), z])
    m = checker.log_mel(x)
    return m[:, : min(3000, m.shape[1] // 2 * 2)]


class Ear:
    """Same interface as checker.Hisn (logprobs over 20 s windows, frames for the unpadded audio)."""

    def __init__(self, path=None, device='cpu', pad=LEAD, name='hisn-torch'):
        self.m = load(path, device)
        self.device, self.pad, self.name = device, pad, name
        self.vocab = json.loads((MODEL / 'config.json').read_text())['phonemes']
        self.index = {p: i + 1 for i, p in enumerate(self.vocab)}

    @torch.no_grad()
    def _run(self, x, heads=False):
        mel = torch.from_numpy(mel_of(x, self.pad))[None].to(self.device)
        out = self.m(mel)
        lp = torch.log_softmax(out['phonemes'][0].float(), -1).cpu().numpy()
        k = int(round(self.pad * 50))
        n = (1 + len(x) // 160) // 2
        lp = lp[k:k + n]
        if heads:
            return lp, {h: torch.log_softmax(v[0].float(), -1).cpu().numpy()[k:k + n] for h, v in out.items() if h != 'phonemes'}
        return lp

    def logprobs(self, x, win=20.0, hop=16.0):
        import checker
        return checker.Hisn.logprobs(self, x, win, hop)

    def stream(self, x, win=4.0, hop=0.5, look=1.0):
        import checker
        return checker.Hisn.stream(self, x, win, hop, look)
