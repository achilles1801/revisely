"""Where a memorizer went: a run of words said wrong or left out that is another passage's words (mutashabihat).

Memorizers slip into a similar passage without noticing: two places share some words, then go different ways, and at
the fork the reciter carries on with the other place's words (2:48 said with 2:123's «عدل ولا تنفعها شفاعة»; 2:5,
the same as Luqmān 31:5, then Luqmān 31:6). The checker sees that only as words skipped or said wrong. This names the
place, for the mark's card ("You continued with Luqmān 31:6").

1. Forks come from the text itself: a place j elsewhere whose two words before it (across ayah ends too) are the two
   words before the fork, and whose own word differs. Computed from the app's word list, not copied from a list.
2. For each run of words the checker didn't hear right, the audio after the last word heard right is fitted against
   the expected words and against each place's words (a CTC best path that may stop part way: nats a frame below the
   ear's own best, 0 = perfect), all places in one pass.
3. A place is named when it fits well (FIT), covers most of two words or more (WORDS), and beats the expected words by
   ADV nats in all and GAIN a frame.

Lab, Nov 15 2026 (similar_eval.py, the released ear's bench results): of bench-v0's 111 planted slips into a similar
ayah (8 professional reciters, clean and babble) 107 named with the right place, none with a wrong one, and no name
anywhere else in its 360 takes; /record's two scripted slips (2:48 → 2:123, 2:5 → Luqmān 31:6) named right and nothing
else in its 38 takes; nothing named in the 716 learners' takes or the 13 Dev takes. 1 ms a take (median), 75 ms at
most, on the Mac.

    import similar
    idx = similar.Index(bench.Words())
    names = similar.find(lp, order, statuses, spans, extras, labels_of, idx)
"""
import numpy as np

import bench

P = {
    'fit': 1.2,        # nats a frame: the place's words fit at least this well
    'words': 1.8,      # words of the place heard (the last in part: its share of sounds)
    'adv': 120.0,      # nats in all by which the place beats the expected words over the same audio...
    'gain': 0.5,       # ...and a frame
    'max_words': 20,   # words of each place (and of the expected passage) fitted
    'max_secs': 15.0,  # audio fitted after the fork, at most
    'min_secs': 0.3,   # less audio than this after the fork: nothing to name
    'stable': 3,       # a run ends where this many words in a row are heard right with no extra speech between
    'kmax': 40,        # shared words counted up to this
    'cont': 6,         # places whose next this-many words are the same are one place (the one sharing more words)
    'max_places': 64,  # places fitted per fork, those sharing the most words first
}
FPS = 50


class Index:
    """The app's words as letters (bench.normalize), and where each pair of words is said."""

    def __init__(self, words):
        self.words = words
        self.norm = [bench.normalize(x) for v in words.imlaei for x in v.split(' ')]
        self.verse = [v for v, n in enumerate(words.counts) for _ in range(n)]
        self.pairs = {}
        for w in range(2, len(self.norm)):
            self.pairs.setdefault((self.norm[w - 2], self.norm[w - 1]), []).append(w)

    def ayah(self, w):
        """[surah, ayah] of app word w."""
        if not hasattr(self, '_aoi'):
            self._aoi = {v: k for k, v in self.words.vindex.items()}
        return list(self._aoi[self.verse[w]])

    def places(self, f, need=1):
        """Places j whose two words before them are the two before word f and whose word differs, with how many words
        before them match (at least `need`, at most kmax)."""
        nm = self.norm
        out = []
        for j in self.pairs.get((nm[f - 2], nm[f - 1]), ()) if f >= 2 else ():
            if j == f or nm[j] == nm[f]:
                continue
            k = 2
            while k < P['kmax'] and f - k - 1 >= 0 and j - k - 1 >= 0 and nm[f - k - 1] == nm[j - k - 1]:
                k += 1
            if k >= need:
                out.append((j, k))
        return out


def fit_many(seg, chains):
    """For each (labels, word_ends): how far below the ear's own best the frames fit a start of the labels (nats a
    frame) and how many words of it the best path heard (the last one in part). One pass over every chain."""
    T = seg.shape[0]
    out = [(99.0, 0.0)] * len(chains)
    live = [i for i, (lab, _) in enumerate(chains) if lab]
    if T == 0 or not live:
        return out
    ext, skip, same, start, owner = [], [], [], [], []
    for i in live:
        lab = chains[i][0]
        L = len(lab)
        e = np.zeros(2 * L + 1, np.int64)
        e[1::2] = lab
        sk = np.zeros(2 * L + 1, bool)
        if L > 1:
            sk[3::2] = np.array(lab[1:]) != np.array(lab[:-1])
        sm = np.ones(2 * L + 1, bool)
        sm[0] = False  # no step into a chain's first state from the chain before
        st = np.zeros(2 * L + 1, bool)
        st[:2] = True
        ext.append(e); skip.append(sk); same.append(sm); start.append(st); owner.append(np.full(2 * L + 1, i))
    ext, skip, same, start = (np.concatenate(a) for a in (ext, skip, same, start))
    skip[:2] = False
    owner = np.concatenate(owner)
    d = np.where(start, seg[0, ext], -1e30)
    for t in range(1, T):
        n = d.copy()
        n[1:] = np.where(same[1:], np.maximum(n[1:], d[:-1]), n[1:])
        n[2:] = np.where(skip[2:], np.maximum(n[2:], d[:-2]), n[2:])
        d = n + seg[t, ext]
    best = seg.max(axis=1).sum()
    bounds = np.flatnonzero(np.r_[True, owner[1:] != owner[:-1]])
    for b0, b1 in zip(bounds, list(bounds[1:]) + [len(owner)]):
        i = int(owner[b0])
        s = int(np.argmax(d[b0:b1]))
        done = (s + 1) // 2  # labels said in full
        ends = chains[i][1]
        words = sum(1 for e in ends if e <= done)
        if words < len(ends):
            prev = ends[words - 1] if words else 0
            words += (done - prev) / max(1, ends[words] - prev)
        out[i] = (float((best - d[b0:b1].max()) / T), round(float(words), 2))
    return out


def find(lp, order, statuses, spans, extras, labels_of, idx, p=None):
    """Names for the runs of words not heard right. order: the passage's app words in order; statuses: word ->
    'correct', 'missed', 'wrong'… ; spans: word -> (first frame, last frame) said; extras: [{'after': w}] (speech
    between w and the next word); labels_of(lo, hi) -> (labels, word ends) for app words [lo, hi).
    Returns [{'mark': first word of the run, 'upto': the word heard right again (None: the end), 'fork': app word
    where the place's words began instead, 'w': the place's first word said, 'also': other places with the same words
    as far as heard, 'words', 'fit', 'adv'}]."""
    p = dict(P, **(p or {}))
    nm = idx.norm
    W = len(nm)
    after_extra = {e['after'] for e in extras}
    # a word said right after going back counts as heard right
    st = ['correct' if statuses.get(w) == 'corrected' else statuses.get(w) for w in order]
    T = lp.shape[0]
    out = []
    i = 1
    while i < len(order):
        if st[i] == 'correct' or st[i - 1] != 'correct':
            i += 1
            continue
        r = i
        while r < len(order):
            if all(r + q < len(order) and st[r + q] == 'correct' for q in range(p['stable'])) and \
                    not any(order[r + q] in after_extra for q in range(p['stable'] - 1)):
                break
            r += 1
        t1 = spans[order[r]][0] if r < len(order) and order[r] in spans else T
        best = None
        # where the place's words may begin: a word or two either side of the run's first word. b is the last word
        # heard right before it; the words between b and the fork (the checker often hears the word before a slip
        # joined to it, and marks it) were said as the shared words, so a place must share them too
        tries = [(q, q - 1) for q in (i - 2, i - 1, i)] + [(q, i - 1) for q in (i + 1, i + 2)]
        for q, b in tries:
            if q < 1 or b < 0 or q >= len(order) or q > r or st[b] != 'correct' or order[b] not in spans:
                continue
            gap = q - 1 - b
            wf = order[q]
            # after b, or after a later word with b's letters (the reciter went back and said it again, and the
            # checker took it for the later word: /record w3)
            starts = {spans[order[b]][1]}
            for qq in range(b + 1, min(len(order), r + 1)):
                if nm[order[qq]] == nm[order[b]] and order[qq] in spans:
                    starts.add(spans[order[qq]][1])
            places = idx.places(wf, need=gap + 1)
            if not places:
                continue
            groups = {}
            for j, k in places:
                c = tuple(nm[j:min(W, j + p['cont'])])
                g = groups.setdefault(c, {'j': j, 'k': k})
                if k > g['k']:
                    g['j'], g['k'] = j, k
            cands = sorted(groups.values(), key=lambda g: -g['k'])[:p['max_places']]
            chains = [labels_of(wf - gap, min(W, wf - gap + p['max_words']))]
            chains += [labels_of(g['j'] - gap, min(W, g['j'] - gap + p['max_words'])) for g in cands]
            for t0 in sorted(starts):
                t_end = min(t1, t0 + int(p['max_secs'] * FPS))
                if t_end - t0 < p['min_secs'] * FPS:
                    continue
                fits = fit_many(lp[t0:t_end], chains)
                exp_fit = fits[0][0]
                k_best = min(range(len(cands)), key=lambda c: fits[c + 1][0])
                f, words = fits[k_best + 1]
                words = max(0.0, words - gap)
                gain = exp_fit - f
                adv = gain * (t_end - t0)
                if f > p['fit'] or words < p['words'] or adv < p['adv'] or gain < p['gain']:
                    continue
                key = (-adv, abs(q - i))
                if best is None or key < best[0]:
                    best = (key, wf, cands[k_best]['j'], words, f, adv, places)
        if best is not None:
            _, wf, j, words, f, adv, places = best
            n = max(2, min(int(words), p['max_words']))
            same = sorted({x for x, _ in places if x != j and nm[x:x + n] == nm[j:j + n]})
            out.append({'mark': order[i], 'upto': order[r] if r < len(order) else None, 'fork': wf, 'w': j,
                        'also': same, 'words': words, 'fit': round(f, 3), 'adv': round(adv, 1)})
        i = r + 1
    return out
