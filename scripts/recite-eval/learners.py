#!/usr/bin/env python3
"""Held-out learner recordings for the benchmark: RetaSy's Quranic Audio Dataset (crowdsourced recitations by
non-Arabic speakers, each an ayah or part of one, labelled correct or in_correct by annotators; arXiv
2405.02675, huggingface.co/datasets/RetaSy/quranic_audio_dataset). Evaluation only; its licence isn't stated,
so nothing from it is redistributed or used for training.

Each recording becomes a benchmark item whose words are the ayah text it was labelled with, found in the
app's word list. The labels are per recording, not per word: on a `correct` recording any flag is a false
alarm; on an `in_correct` one a flag may be right (but the mistake may be tajweed, which word-level checking
can't see).

  python learners.py --parquet DIR [--out DIR]
"""
import argparse
import hashlib
import io
import json
import pathlib
import subprocess
import sys

import numpy as np
import pyarrow.parquet as pq
import soundfile as sf

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from bench import SR, Words, floor_noise  # noqa: E402
from bench import normalize as _normalize  # noqa: E402


def normalize(word):
    # This dataset's Uthmani text uses the Persian yeh and kaf and the small marks of U+08D3..U+08FF.
    word = word.replace('\u06cc', '\u064a').replace('\u06a9', '\u0643')
    word = ''.join(ch for ch in word if not 0x08D3 <= ord(ch) <= 0x08FF)
    return _normalize(word)

SURAH = {'Al-Faatihah': 1, 'Al-Kafiroon': 109, 'An-Nas': 114, 'Al-Ikhlas': 112, 'Al-Falaq': 113, 'Al-Asr': 103,
         'Al-Masad': 111, 'Ayat al-Kursi': 2, 'An-Nasr': 110, 'Al-Kauthar': 108, 'Al-Humazah': 104}


def find(words, sura, text):
    """(first word, last word + 1) of the text in the sura, or None. Ayat al-Kursi is 2:255 (or part)."""
    target = [normalize(x) for x in text.replace(' ', ' ').split() if normalize(x)]
    if not target:
        return None
    ayat = [255] if sura == 2 else [a for (s, a) in words.vindex if s == sura]
    for a in ayat:
        v = words.vindex[(sura, a)]
        for spelling in (words.imlaei[v], words.uthmani[v]):
            got = [normalize(x) for x in spelling.replace(' ', ' ').split(' ')]
            # words joined on the page (يا أيها) may be two in the text
            for k in range(len(got) - len(target) + 1):
                if got[k:k + len(target)] == target:
                    first = words.first_word(sura, a)
                    return first + k, first + k + len(target)
            joined, tj = ''.join(got), ''.join(target)
            if tj and tj in joined and (joined == tj or len(tj) > 6):
                # map by letters: find word boundaries that cover the text
                pos = joined.index(tj)
                acc, start, end = 0, None, None
                for i, w in enumerate(got):
                    if start is None and acc + len(w) > pos:
                        start = i
                    acc += len(w)
                    if acc >= pos + len(tj):
                        end = i + 1
                        break
                first = words.first_word(sura, a)
                return first + start, first + end
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--parquet', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/raw/retasy'))
    ap.add_argument('--out', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/learners-v0'))
    args = ap.parse_args()
    words = Words()
    out = pathlib.Path(args.out)
    (out / 'items').mkdir(parents=True, exist_ok=True)
    index = []
    skipped = {}
    seen = set()
    import random
    for f in sorted(pathlib.Path(args.parquet).glob('*.parquet')):
        t = pq.read_table(f, columns=['Surah', 'Aya', 'final_label', 'golden', 'reciter_id', 'reciter_gender', 'audio'])
        for row in t.to_pylist():
            label = row['final_label']
            if label not in ('correct', 'in_correct'):
                continue
            sura = SURAH.get(row['Surah'])
            if sura is None:
                skipped['not quran'] = skipped.get('not quran', 0) + 1
                continue
            rng_ = find(words, sura, row['Aya'] or '')
            if rng_ is None:
                skipped['text not found'] = skipped.get('text not found', 0) + 1
                continue
            raw = row['audio']['bytes']
            pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', '-', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                                 input=raw, capture_output=True)
            if pcm.returncode != 0 or not pcm.stdout:
                skipped['audio'] = skipped.get('audio', 0) + 1
                continue
            x = np.frombuffer(pcm.stdout, dtype=np.float32)
            # room for the segmenter to start and finish
            x = np.concatenate([np.zeros(int(0.8 * SR), np.float32), x, np.zeros(int(1.2 * SR), np.float32)])
            rng = random.Random(row['audio'].get('path') or hashlib.sha1(raw).hexdigest())
            x = floor_noise(x, rng)
            peak = float(np.max(np.abs(x))) or 1.0
            if peak > 0.99:
                x = x / peak * 0.9
            lo, hi = rng_
            item = f"learner.{'ok' if label == 'correct' else 'bad'}.{hashlib.sha1(raw).hexdigest()[:10]}"
            if item in seen:  # the same upload more than once
                continue
            seen.add(item)
            pcm16 = np.clip(x * 32767, -32768, 32767).astype(np.int16)
            sf.write(out / 'items' / f'{item}.wav', pcm16, SR, subtype='PCM_16')
            meta = {'id': item, 'reciter': f"learner-{row['reciter_id']}", 'passage': f'{sura}', 'variant':
                    'learner-correct' if label == 'correct' else 'learner-incorrect', 'condition': 'phone',
                    'duration': round(len(x) / SR, 2), 'golden': row['golden'], 'gender': row['reciter_gender'],
                    'range': [lo, hi], 'start_at': lo, 'text': row['Aya'], 'events': [],
                    'labels': {str(w): {'label': 'ok' if label == 'correct' else 'unknown', 'start': 0, 'end': 0}
                               for w in range(lo, hi)}}
            (out / 'items' / f'{item}.json').write_text(json.dumps(meta, ensure_ascii=False))
            index.append({k: meta[k] for k in ('id', 'variant', 'passage', 'duration', 'golden')})
    (out / 'index.json').write_text(json.dumps(index, indent=1, ensure_ascii=False))
    ok = sum(1 for i in index if i['variant'] == 'learner-correct')
    print(f'{len(index)} items ({ok} correct, {len(index) - ok} in_correct), skipped {skipped}, in {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
