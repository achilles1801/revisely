"""Planting tajweed and letter slips in correct recitation, labels changed to match (for the fine-tune).

A clip is (audio int16/float32 at 16 kHz, labels [vocab index], emit [(first, end) model frame of each label's own
emission]). Each slip edits one place and returns the new audio and labels:
  madd      a long vowel held for another count (0–6): the vowel time-stretched (WSOLA) in proportion
  ghunnah   a held ن/م cut to 2 symbols' length
  ikhfa     a hidden ن (ںںں) replaced by a clear ن cut from the same clip
  qalqalah  the bounce (ڇ) muted
  letter    a letter replaced by a confusable one (ص/س, ض/د, ...) cut from the same clip
  haraka    a short vowel replaced by another one from the same clip
  null      the same kind of edit with nothing changed (so an edit's traces alone never mean a slip)
Edits are applied from the end of the clip backwards, so earlier frame positions stay valid.
"""
import numpy as np

FR = 320  # samples per model frame (50 a second)
LONG = 'اۥۦ'
HARAKAT = 'َُِ'
CONFUSE = {
    'ص': 'س', 'س': 'صش', 'ض': 'دظ', 'د': 'ض', 'ط': 'ت', 'ت': 'ط', 'ظ': 'زذض', 'ذ': 'زد', 'ز': 'ذ', 'ث': 'ست',
    'ح': 'هخ', 'ه': 'ح', 'خ': 'ح', 'ع': 'ء', 'ء': 'ع', 'ق': 'كغ', 'ك': 'ق', 'غ': 'خ', 'ش': 'س',
}


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
    c += [('letter', i, i + 1) for i, l in enumerate(labels) if vocab[l - 1] in CONFUSE and set(CONFUSE[vocab[l - 1]]) & have]
    c += [('haraka', i, i + 1) for i, l in enumerate(labels) if vocab[l - 1] in HARAKAT]
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
        opts = [z for z in CONFUSE.get(c, '') if z in {vocab[l - 1] for l in labels0}]
        if not opts:
            return None
        d = rng.choice(opts)
        src = [p for p, l in enumerate(labels0) if vocab[l - 1] == d]
        new_lab, what = [idx[d]], f'{c}→{d}'
    elif kind == 'haraka':
        c = vocab[labels[i] - 1]
        others = [z for z in HARAKAT if z != c and z in {vocab[l - 1] for l in labels0}]
        if not others:
            return None
        d = rng.choice(others)
        src = [p for p, l in enumerate(labels0) if vocab[l - 1] == d]
        new_lab, what = [idx[d]], f'{c}→{d}'
    else:
        return None
    if not src:
        return None
    s = int(rng.choice(src))
    sa, sb = max(0, emit[s][0] - 1) * FR, min(len(x0), (emit[s][1] + 1) * FR)
    a, b = max(0, emit[i][0] - (0 if kind == 'ikhfa' else 1)) * FR, min(len(x), (emit[j - 1][1] + (0 if kind == 'ikhfa' else 1)) * FR)
    if sb - sa < FR or b - a < FR:
        return None
    labels[i:j] = new_lab
    return splice(x, a, b, x0[sa:sb].copy()), labels, what


WEIGHT = {'madd': 3.0, 'ghunnah': 2.0, 'ikhfa': 2.0, 'qalqalah': 2.0, 'letter': 1.5, 'haraka': 1.0}


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
