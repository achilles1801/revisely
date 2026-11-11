"""Planting tajweed and letter slips in correct recitation, labels changed to match (for the fine-tune).

A clip is (audio int16/float32 at 16 kHz, labels [vocab index], emit [(first, end) model frame of each label's own
emission]). Each slip edits one place and returns the new audio and labels:
  madd      a long vowel held for another count (0–6): the vowel time-stretched (WSOLA) in proportion
  ghunnah   a held ن/م cut to 2 symbols' length
  ikhfa     a hidden ن (ںںں) replaced by a clear ن cut from the same clip
  qalqalah  the bounce (ڇ) muted
  letter    a letter replaced by a confusable one (ص/س, ض/د, ...) cut from the same clip
  haraka    a short vowel replaced by another one from the same clip
  swap      any consonant replaced by any other one from the same clip (v5: فَمَا said as وَمَا, خَلَتْ as خَلَقَ; v4 had
            learned to hear the expected word there, from hundreds of hours of always-correct recitation)
  null      the same kind of edit with nothing changed (so an edit's traces alone never mean a slip)
Edits are applied from the end of the clip backwards, so earlier frame positions stay valid.

mosaic() is the other v5 addition: a clip stitched from stretches of several ayat, so no sound can be guessed from
the text around it.
"""
import numpy as np

FR = 320  # samples per model frame (50 a second)
LONG = 'اۥۦ'
HARAKAT = 'َُِ'
CONFUSE = {
    'ص': 'س', 'س': 'صش', 'ض': 'دظ', 'د': 'ض', 'ط': 'ت', 'ت': 'ط', 'ظ': 'زذض', 'ذ': 'زد', 'ز': 'ذ', 'ث': 'ست',
    'ح': 'هخ', 'ه': 'ح', 'خ': 'ح', 'ع': 'ء', 'ء': 'ع', 'ق': 'كغ', 'ك': 'ق', 'غ': 'خ', 'ش': 'س',
}
CONSONANTS = set('ءبتثجحخدذرزسشصضطظعغفقكلمنهوي')
# Letter slips cut a consonant together with its vowel (v5): a consonant cut alone kept the original's release into
# the vowel, and the released model heard the original letter in 30 of 49 such slips (aug_check.py)
CV_UNITS = True


def single(labels, i):
    """labels[i] is one sound on its own (not half of a doubled, shadda letter)."""
    return (i == 0 or labels[i - 1] != labels[i]) and (i + 1 == len(labels) or labels[i + 1] != labels[i])


def wsola(x, out_len, win=640, tol=160):
    """Time-stretch x to out_len samples (waveform-similarity overlap-add; keeps the pitch)."""
    n = len(x)
    if n < win * 2 or out_len < win:
        idx = np.linspace(0, n - 1, max(out_len, 1))
        return np.interp(idx, np.arange(n), x).astype(np.float32)
    hs = win // 2
    rate = (n - win) / max(out_len - win, 1)
    w = np.hanning(win).astype(np.float32)
    k_max = (out_len - win) // hs + 1
    y = np.zeros(out_len + win, np.float32); norm = np.zeros_like(y)
    prev = 0
    for k in range(k_max):
        target = int(k * hs * rate)
        if k == 0:
            p = 0
        else:
            nat = prev + hs
            lo, hi = max(0, target - tol), min(n - win, target + tol)
            if hi <= lo:
                p = min(max(target, 0), n - win)
            else:
                ref = x[nat:nat + win] if nat + win <= n else x[n - win:n]
                best, p = -1e30, lo
                for q in range(lo, hi + 1, 8):
                    c = float(np.dot(ref, x[q:q + win]))
                    if c > best:
                        best, p = c, q
        y[k * hs:k * hs + win] += x[p:p + win] * w
        norm[k * hs:k * hs + win] += w
        prev = p
    y = y[:out_len] / np.maximum(norm[:out_len], 1e-3)
    return y


def splice(x, a, b, mid, fade=80):
    """x with x[a:b] replaced by mid, crossfaded over fade samples at both joins."""
    left, right = x[:a].copy(), x[b:].copy()
    mid = mid.astype(np.float32).copy()
    f = min(fade, len(left), len(mid) // 2, len(right))
    if f > 1:
        r = np.linspace(0, 1, f, dtype=np.float32)
        mid[:f] = mid[:f] * r + left[-f:] * (1 - r); left = left[:-f]
        mid[-f:] = mid[-f:] * (1 - r) + right[:f] * r; right = right[f:]
    return np.concatenate([left, mid, right])


def runs(labels, vocab, chars, min_len=1):
    out, i = [], 0
    while i < len(labels):
        c = vocab[labels[i] - 1]
        j = i
        while j < len(labels) and labels[j] == labels[i]:
            j += 1
        if c in chars and j - i >= min_len:
            out.append((i, j))
        i = j
    return out


def candidates(labels, vocab):
    """Every place a slip can go: (kind, i, j)."""
    c = [('madd', i, j) for i, j in runs(labels, vocab, LONG)]
    c += [('ghunnah', i, j) for i, j in runs(labels, vocab, 'نم', 3)]
    if any(vocab[l - 1] == 'ن' for l in labels):
        c += [('ikhfa', i, j) for i, j in runs(labels, vocab, 'ں')]
    c += [('qalqalah', i, i + 1) for i, l in enumerate(labels) if vocab[l - 1] == 'ڇ']
    have = {vocab[l - 1] for l in labels}
    w = 2 if CV_UNITS else 1
    cv_ok = lambda i: not CV_UNITS or (i + 1 < len(labels) and vocab[labels[i + 1] - 1] in HARAKAT)
    c += [('letter', i, i + w) for i, l in enumerate(labels)
          if vocab[l - 1] in CONFUSE and set(CONFUSE[vocab[l - 1]]) & have and cv_ok(i)]
    if CV_UNITS:  # the vowel with the consonant before it (the same consonant, cut from where another vowel follows it)
        c += [('haraka', i - 1, i + 1) for i, l in enumerate(labels)
              if i > 0 and vocab[l - 1] in HARAKAT and vocab[labels[i - 1] - 1] in CONSONANTS]
    else:
        c += [('haraka', i, i + 1) for i, l in enumerate(labels) if vocab[l - 1] in HARAKAT]
    cons = have & CONSONANTS
    c += [('swap', i, i + w) for i, l in enumerate(labels)
          if vocab[l - 1] in CONSONANTS and single(labels, i) and len(cons - {vocab[l - 1]}) > 0 and cv_ok(i)]
    return c


def apply(x, labels, emit, vocab, slip, rng, x0=None, labels0=None):
    """One slip at (kind, i, j). Returns (audio, labels, what) or None. Sounds cut from elsewhere come from the
    original clip (x0, labels0), whose positions emit describes; the target i..j is still in its original place,
    since slips are applied from the end of the clip backwards."""
    kind, i, j = slip
    idx = {p: k + 1 for k, p in enumerate(vocab)}
    labels = list(labels)
    x0 = x if x0 is None else x0
    labels0 = labels if labels0 is None else list(labels0)
    if kind in ('madd', 'ghunnah', 'null'):
        if kind == 'madd':
            n = j - i
            start = emit[i - 1][0] if i > 0 and vocab[labels[i - 1] - 1] in HARAKAT else emit[i][0]
            a, b = start * FR, emit[j - 1][1] * FR
            k = int(rng.choice([c for c in range(0, 7) if c != n]))
            new = int((b - a) * (k + 1) / (n + 1))
            labels[i:j] = [labels[i]] * k
            what = f'madd {n}→{k}'
        elif kind == 'ghunnah':
            n = j - i
            a, b = emit[i][0] * FR, emit[j - 1][1] * FR
            new = int((b - a) * 2 / n)
            labels[i:j] = [labels[i]] * 2
            what = f'ghunnah {n}→2'
        else:  # the same edit, nothing changed: a stretch of ±8% somewhere
            a, b = emit[i][0] * FR, emit[j - 1][1] * FR
            new = int((b - a) * rng.uniform(0.92, 1.08))
            what = 'null'
        if b - a < FR * 2:
            return None
        if new <= 0:
            mid = np.zeros(0, np.float32)
        else:  # stretch the steady middle, keep the edges (the transitions into and out of the sound) as they were
            e = int((b - a) * 0.15)
            core = max(new - 2 * e, FR // 2)
            mid = np.concatenate([x[a:a + e], wsola(x[a + e:b - e], core), x[b - e:b]]) if new > 2 * e + FR // 2 else wsola(x[a:b], new)
        return splice(x, a, b, mid), labels, what
    if kind == 'qalqalah':
        a, b = emit[i][0] * FR, min(len(x), (emit[i][1] + 2) * FR)
        if i + 1 < len(emit):
            b = min(b, emit[i + 1][0] * FR)
        if b - a < FR:
            return None
        mid = x[a:b] * np.float32(0.03)
        del labels[i]
        return splice(x, a, b, mid, fade=48), labels, 'qalqalah removed'
    # replace a region with one cut from elsewhere in the clip
    if kind == 'ikhfa':
        L0 = labels0
        src = [p for p, l in enumerate(L0) if vocab[l - 1] == 'ن' and (p == 0 or L0[p - 1] != l) and (p + 1 == len(L0) or L0[p + 1] != l)]
        new_lab, what = [idx['ن']], 'ikhfa → clear ن'
    elif kind == 'letter':
        c = vocab[labels[i] - 1]
        ok = lambda p: j - i == 1 or (p + 1 < len(labels0) and labels0[p + 1] == labels[i + 1])
        opts = [z for z in CONFUSE.get(c, '') if any(vocab[l - 1] == z and ok(p) for p, l in enumerate(labels0))]
        if not opts:
            return None
        d = rng.choice(opts)
        src = [p for p, l in enumerate(labels0) if vocab[l - 1] == d and ok(p)]
        new_lab, what = [idx[d]] + labels[i + 1:j], f'{c}→{d}'
    elif kind == 'haraka' and j - i == 2:
        k, c = labels[i], vocab[labels[i + 1] - 1]
        pairs = [(p, vocab[labels0[p + 1] - 1]) for p in range(len(labels0) - 1)
                 if labels0[p] == k and vocab[labels0[p + 1] - 1] in HARAKAT and vocab[labels0[p + 1] - 1] != c]
        if not pairs:
            return None
        d = pairs[int(rng.integers(len(pairs)))][1]
        src = [p for p, z in pairs if z == d]
        new_lab, what = [k, idx[d]], f'{c}→{d}'
    elif kind == 'haraka':
        c = vocab[labels[i] - 1]
        others = [z for z in HARAKAT if z != c and z in {vocab[l - 1] for l in labels0}]
        if not others:
            return None
        d = rng.choice(others)
        src = [p for p, l in enumerate(labels0) if vocab[l - 1] == d]
        new_lab, what = [idx[d]], f'{c}→{d}'
    elif kind == 'swap':
        c = vocab[labels[i] - 1]
        ok = lambda p: j - i == 1 or (p + 1 < len(labels0) and labels0[p + 1] == labels[i + 1])
        src = [p for p, l in enumerate(labels0)
               if vocab[l - 1] in CONSONANTS and vocab[l - 1] != c and single(labels0, p) and ok(p)]
        if not src:
            return None
        d = vocab[labels0[int(rng.choice(src))] - 1]
        src = [p for p in src if vocab[labels0[p] - 1] == d]
        new_lab, what = [idx[d]] + labels[i + 1:j], f'swap {c}→{d}'
    else:
        return None
    if not src:
        return None
    s = int(rng.choice(src))
    if kind in ('letter', 'swap', 'haraka') and j - i == 2:
        gap = lambda k, n: (emit[k - 1][1] + emit[k][0]) // 2 if 0 < k < n else (emit[k][0] - 1 if k == 0 else emit[-1][1] + 1)
        n0 = len(emit)
        sa, sb = max(0, gap(s, n0)) * FR, min(len(x0), (gap(s + 2, n0) if s + 2 < n0 else emit[-1][1] + 1) * FR)
        a, b = max(0, gap(i, n0)) * FR, min(len(x), (gap(j, n0) if j < n0 else emit[-1][1] + 1) * FR)
    else:
        sa, sb = max(0, emit[s][0] - 1) * FR, min(len(x0), (emit[s][1] + 1) * FR)
        a, b = max(0, emit[i][0] - (0 if kind == 'ikhfa' else 1)) * FR, min(len(x), (emit[j - 1][1] + (0 if kind == 'ikhfa' else 1)) * FR)
    if sb - sa < FR or b - a < FR:
        return None
    labels[i:j] = new_lab
    return splice(x, a, b, x0[sa:sb].copy()), labels, what


# v1 weighted madd most; madd length is now judged by timing (tajweed.madd_count), so v2 puts the weight on what
# only the model can hear: ikhfa, ghunnah, letters
# v5 adds swap, as often as the confusable letters
WEIGHT = {'madd': 1.5, 'ghunnah': 2.5, 'ikhfa': 3.0, 'qalqalah': 1.5, 'letter': 2.5, 'haraka': 1.5, 'swap': 2.5}


def plant(x, labels, emit, vocab, rng, n_slips=1, null_p=0.3):
    """Up to n_slips slips at random places (end of the clip first). A kind is drawn first (WEIGHT, among the kinds
    the clip has), then a place, so rare slips (ikhfa, qalqalah) come up as often as common ones. Returns
    (audio, labels, [what])."""
    x = x.astype(np.float32)
    if np.abs(x).max() > 2:
        x = x / 32768.0
    by = {}
    for c in candidates(labels, vocab):
        by.setdefault(c[0], []).append(c)
    cands = []
    for _ in range(4 * n_slips):
        kinds = [k for k in by if by[k]]
        if not kinds:
            break
        w = np.array([WEIGHT[k] for k in kinds]); k = kinds[int(rng.choice(len(kinds), p=w / w.sum()))]
        cands.append(by[k].pop(int(rng.integers(len(by[k])))))
    chosen, used = [], set()
    for kind, i, j in cands:
        if len(chosen) >= n_slips:
            break
        if used & set(range(i - 2, j + 2)):
            continue
        chosen.append((kind, i, j)); used |= set(range(i, j))
    if rng.random() < null_p and len(labels) > 6:
        p = int(rng.integers(0, len(labels) - 3))
        if not used & set(range(p - 2, p + 5)):
            chosen.append(('null', p, p + 3))
    chosen.sort(key=lambda s: -s[1])
    whats = []
    x0, labels0 = x.copy(), list(labels)
    for slip in chosen:
        r = apply(x, labels, emit, vocab, slip, rng, x0, labels0)
        if r is not None:
            x, labels, w = r
            whats.append(w)
    return x, labels, whats


def mosaic_pieces(pieces, vocab, rng, min_len=4, max_len=16):
    """From each clip [(audio, labels, emit)], a stretch of min_len–max_len sounds that starts and ends on a
    consonant's onset, cut midway through the gap before it. Returns [(audio float32, labels)]."""
    out = []
    for x, labels, emit in pieces:
        x = x.astype(np.float32)
        if np.abs(x).max() > 2:
            x = x / 32768.0
        labels = list(labels)
        n = len(labels)
        onsets = [k for k in range(1, n) if vocab[labels[k] - 1] in CONSONANTS and labels[k - 1] != labels[k]]
        if len(onsets) < 2:
            continue
        s = int(rng.choice([0] + onsets[:-1]))
        ends = [k for k in onsets + [n] if min_len <= k - s <= max_len]
        if not ends:
            continue
        e = int(rng.choice(ends))
        a = 0 if s == 0 else (emit[s - 1][1] + emit[s][0]) // 2 * FR
        b = len(x) if e == n else min(len(x), (emit[e - 1][1] + emit[e][0]) // 2 * FR)
        if b - a < 2 * FR:
            continue
        out.append((x[a:b], labels[s:e]))
    return out


def join(xs, fade=80):
    y = xs[0]
    for z in xs[1:]:
        f = min(fade, len(y) // 2, len(z) // 2)
        r = np.linspace(0, 1, f, dtype=np.float32)
        y = np.concatenate([y[:-f], y[-f:] * (1 - r) + z[:f] * r, z[f:]])
    return y.astype(np.float32)


def mosaic(pieces, vocab, rng, **kw):
    """A clip stitched from stretches of several ayat (mosaic_pieces, join). Returns (audio, labels) or None."""
    ps = mosaic_pieces(pieces, vocab, rng, **kw)
    if len(ps) < 2:
        return None
    return join([x for x, _ in ps]), [l for _, ls in ps for l in ls]


def channel(x, rng, others=(), sr=16000):
    """A phone in a room: some of reverb, a phone microphone's band, background speech or noise, gain.
    others: a few other clips (float32) to make babble from. Length and timing unchanged."""
    from scipy.signal import butter, fftconvolve, sosfilt
    y = x.astype(np.float32)
    n = len(y)
    if rng.random() < 0.45:  # a room: exponentially decaying noise as the tail, the direct sound first
        rt60 = rng.uniform(0.15, 0.7)
        L = int(rt60 * sr)
        t = np.arange(L) / sr
        rir = rng.standard_normal(L).astype(np.float32) * np.exp(-6.9 * t / rt60).astype(np.float32)
        rir[: int(0.003 * sr)] *= 0.2
        rir[0] = 1.0
        rir /= np.sqrt((rir ** 2).sum())
        wet = fftconvolve(y, rir)[:n].astype(np.float32)
        mix = rng.uniform(0.3, 0.9)
        y = (1 - mix) * y + mix * wet * (np.abs(y).max() / (np.abs(wet).max() + 1e-6))
    if rng.random() < 0.5:  # the phone's microphone and codec: no lows, no highs
        hi = rng.uniform(3200, 7600)
        lo = rng.uniform(60, 300)
        y = sosfilt(butter(4, [lo, min(hi, sr / 2 - 100)], 'bandpass', fs=sr, output='sos'), y).astype(np.float32)
    if rng.random() < 0.55:
        snr = rng.uniform(5, 30)
        kind = rng.random()
        if kind < 0.5 and len(others) >= 2:  # people talking in the background
            noise = np.zeros(n, np.float32)
            for o in rng.choice(len(others), size=min(len(others), int(rng.integers(2, 6))), replace=False):
                src = others[o]
                if len(src) < 1600:
                    continue
                off = int(rng.integers(0, max(1, len(src) - n))) if len(src) > n else 0
                seg = src[off:off + n]
                start = int(rng.integers(0, max(1, n - len(seg) + 1)))
                noise[start:start + len(seg)] += seg / (np.sqrt((seg ** 2).mean()) + 1e-6)
        elif kind < 0.8:  # pink-ish noise (fans, traffic)
            w = rng.standard_normal(n).astype(np.float32)
            f = np.fft.rfft(w); f /= np.maximum(np.sqrt(np.arange(len(f)) + 1.0), 1.0)
            noise = np.fft.irfft(f, n).astype(np.float32)
        else:  # mains hum and its harmonics
            t = np.arange(n) / sr; base = rng.choice([50.0, 60.0])
            noise = sum(np.sin(2 * np.pi * base * k * t + rng.uniform(0, 6.3)) / k for k in range(1, 5)).astype(np.float32)
        ps = float((y ** 2).mean()) + 1e-9; pn = float((noise ** 2).mean()) + 1e-9
        y = y + noise * np.sqrt(ps / (pn * 10 ** (snr / 10)))
    g = rng.uniform(0.3, 1.6)
    y = y * g
    if rng.random() < 0.05:  # a little clipping, as a cheap phone at full volume
        c = rng.uniform(0.3, 0.8) * (np.abs(y).max() + 1e-6)
        y = np.clip(y, -c, c)
    return np.clip(y, -1, 1).astype(np.float32)
