#!/usr/bin/env python3
"""Training data for the fine-tune: Muaalem's dataset (obadx/muaalem-annotated-v3, MIT), lined up sound by sound.

For each downloaded shard (data/raw/muaalem/m<moshaf>-<shard>.parquet): keep clips with Qur'an only (no isti'adha,
basmala or sadaqa line) whose transcript matched well, decode the audio to 16 kHz int16 (one memory-mapped array
per shard), and line the clip's labels (the moshaf's own phonetic script: its madd lengths, ghunnah, qalqalah) up
with the current model's output (CTC Viterbi), so the augmentations know where each sound is.

  python train_prep.py --jobs 10         # writes data/train/<shard>.audio.npy + .meta.pkl
"""
import argparse, io, os, pathlib, pickle, sys
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))


def shard(path):
    import pyarrow.parquet as pq, soundfile as sf
    import checker, tajweed
    ear = checker.Hisn(threads=1)
    out = LAB / 'data/train'
    name = path.stem
    pf = pq.ParquetFile(path)
    audio, metas, pos = [], [], 0
    for g in range(pf.num_row_groups):
        for r in pf.read_row_group(g).to_pylist():
            if not r.get('has_quran', True) or r.get('has_istiaatha') or r.get('has_bismillah') or r.get('has_sadaka') or (r.get('match_ratio') or 1.0) < 0.98:
                continue
            x, sr = sf.read(io.BytesIO(r['audio']['bytes']), dtype='float32')
            if x.ndim > 1:
                x = x.mean(axis=1)
            if sr != 16000 or len(x) > 16000 * 25 or len(x) < 16000:
                continue
            text = r['phonemes'].replace(' ', '')
            labels = [ear.index[c] for c in text if c in ear.index]
            lp = ear.logprobs(x)
            if lp.shape[0] < 2 * len(labels) + 2:
                continue
            spans = tajweed.ctc_align(lp, labels)
            emit = tajweed.ctc_align.emit
            if len(emit) != len(labels):
                continue
            lab_lp = float(np.mean([lp[emit[i][0]:emit[i][1], labels[i]].max() for i in range(len(labels))]))
            q = (x * 32767).clip(-32768, 32767).astype(np.int16)
            audio.append(q)
            metas.append({'off': pos, 'n': len(q), 'labels': np.array(labels, np.int16),
                          'emit': np.array([emit[i] for i in range(len(labels))], np.int32),
                          'span': np.array([spans[i] for i in range(len(labels))], np.int32),
                          'fit': lab_lp, 'moshaf': r['moshaf_id'], 'reciter': r['reciter_english_name'],
                          'seg': r['segment_index'], 'uthmani': r['uthmani']})
            pos += len(q)
    np.save(out / f'{name}.audio.npy', np.concatenate(audio) if audio else np.zeros(0, np.int16))
    pickle.dump(metas, open(out / f'{name}.meta.pkl', 'wb'))
    return name, len(metas), pos / 16000 / 3600


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=6)
    a = ap.parse_args()
    (LAB / 'data/train').mkdir(parents=True, exist_ok=True)
    todo = [p for p in sorted((LAB / 'data/raw/muaalem').glob('m[0-9]*.parquet')) if not (LAB / 'data/train' / f'{p.stem}.meta.pkl').exists()]
    import multiprocessing as mp
    with mp.get_context('spawn').Pool(a.jobs) as pool:
        for name, n, h in pool.imap_unordered(shard, todo):
            print(f'{name}: {n} clips, {h:.2f} h', flush=True)


if __name__ == '__main__':
    main()
