"""A fine-tuned checkpoint as the service runs models: ONNX with the released export's interface (mel [b, 80, t],
riwaya [b] -> logprobs [b, f, 43]), then int8 weights (onnxruntime dynamic quantization). Checks the int8 copy against
the PyTorch model on recordings: the share of frames whose top sound agrees and the sounds' edit distance.

  python export_onnx.py models/ft-v5/step41000.pt models/ft-v5-onnx WAV [WAV ...]
"""
import pathlib
import sys

import numpy as np
import soundfile as sf
import torch

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import hisn_torch  # noqa: E402


class Wrap(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, mel, riwaya):
        return torch.log_softmax(self.m(mel, riwaya=riwaya)['phonemes'].float(), -1)


def main():
    ckpt, out_dir, wavs = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3:]
    out_dir.mkdir(parents=True, exist_ok=True)
    m = hisn_torch.load(ckpt, 'cpu')
    w = Wrap(m).eval()
    mel = torch.zeros(1, 80, 1000)
    fp32, int8 = out_dir / 'model.onnx', out_dir / 'model-int8.onnx'
    torch.onnx.export(w, (mel, torch.zeros(1, dtype=torch.long)), str(fp32), input_names=['mel', 'riwaya'],
                      output_names=['logprobs'], opset_version=17, dynamo=False,
                      dynamic_axes={'mel': {0: 'b', 2: 't'}, 'riwaya': {0: 'b'}, 'logprobs': {0: 'b', 1: 'f'}})
    from onnxruntime.quantization import QuantType, quantize_dynamic
    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8)
    fp32.unlink()
    print(f'{int8}: {int8.stat().st_size / 1e6:.1f} MB')

    import Levenshtein
    import onnxruntime as ort
    sess = ort.InferenceSession(str(int8), providers=['CPUExecutionProvider'])
    agree, dist, total = 0, 0, 0
    for p in wavs:
        x, _ = sf.read(p, dtype='float32')
        x = x[: 16000 * 20]
        mel_np = hisn_torch.mel_of(x)
        with torch.no_grad():
            a = w(torch.from_numpy(mel_np)[None], torch.zeros(1, dtype=torch.long))[0].numpy()
        b = sess.run(None, {'mel': mel_np[None], 'riwaya': np.zeros(1, np.int64)})[0][0]
        n = min(len(a), len(b))
        agree += int((a[:n].argmax(1) == b[:n].argmax(1)).sum())
        total += n

        def seq(lp):
            am = lp.argmax(1)
            return [int(k) for i, k in enumerate(am) if k != 0 and (i == 0 or am[i - 1] != k)]
        sa, sb = seq(a[:n]), seq(b[:n])
        dist += Levenshtein.distance(''.join(map(chr, sa)), ''.join(map(chr, sb))) / max(len(sa), 1)
    if wavs:
        print(f'int8 vs PyTorch on {len(wavs)} recordings: top sound agrees on {agree / total:.2%} of frames, '
              f'sound sequences differ by {dist / len(wavs):.2%}')


if __name__ == '__main__':
    main()
