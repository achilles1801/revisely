"""The teacher (teacher_train.py: Muaalem fine-tuned) with checker.Hisn's interface, so every evaluation can read it:
log-probabilities in HisnLabs' symbol order (blank first), 50 frames a second (each of its 25 shown twice), one frame per student frame of the
unpadded audio, over the same 20 s windows. Without a checkpoint it is Muaalem as released.

  ear = TeacherEar('models/teacher-s8000/last.pt', device='mps', name='teacher8k')
"""
import json
import os
import pathlib
import sys

import numpy as np
import torch

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
MODEL = 'obadx/muaalem-model-v3_2'
os.environ.setdefault('HF_HOME', str(LAB / 'hf-cache'))  # Muaalem's weights are in the lab's own cache


class TeacherEar:
    def __init__(self, path=None, device='mps', name='teacher'):
        from quran_muaalem.modeling.modeling_multi_level_ctc import Wav2Vec2BertForMultilevelCTC
        from quran_muaalem.modeling.multi_level_tokenizer import MultiLevelTokenizer
        from transformers import AutoFeatureExtractor
        m = Wav2Vec2BertForMultilevelCTC.from_pretrained(MODEL)
        if path:
            sd = torch.load(path, map_location='cpu', mmap=True)  # last.pt holds the optimizer too: read only the model
            m.load_state_dict(sd.get('model', sd))
            del sd
        self.m = m.to(device).eval()
        self.proc = AutoFeatureExtractor.from_pretrained(MODEL)
        self.device, self.name = device, name
        self.vocab = json.loads((LAB / 'models/hisnlabs-tajweed-v2/config.json').read_text())['phonemes']
        self.index = {p: i + 1 for i, p in enumerate(self.vocab)}
        v2i = {v: int(i) for i, v in MultiLevelTokenizer(MODEL).id_to_vocab['phonemes'].items()}
        self.cols = torch.tensor([0] + [v2i[p] for p in self.vocab])

    @torch.no_grad()
    def _run(self, x):
        f = self.proc([x], sampling_rate=16000, return_tensors='pt')
        out = self.m(input_features=f['input_features'].to(self.device, torch.float32),
                     attention_mask=f['attention_mask'].to(self.device), return_dict=True)
        lg = out.logits['phonemes'] if isinstance(out.logits, dict) else out.logits
        lp = torch.log_softmax(lg[0].float().cpu()[:, self.cols], -1).numpy()
        lp = np.repeat(lp, 2, axis=0)  # 25 frames a second -> the student's 50 (frame k spans 2k and 2k + 1)
        n = (1 + len(x) // 160) // 2  # the student's frames for this audio (hisn_torch.Ear)
        if len(lp) < n:  # the teacher's features drop the last frame or two: pad with blank
            tail = np.full((n - len(lp), lp.shape[1]), -30.0, np.float32)
            tail[:, 0] = 0.0
            lp = np.concatenate([lp, tail])
        return lp[:n].astype(np.float32)

    def logprobs(self, x, win=20.0, hop=16.0):
        import checker
        return checker.Hisn.logprobs(self, x, win, hop)
