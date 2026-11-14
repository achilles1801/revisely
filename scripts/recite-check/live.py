"""The live check (/live): the lab's live checker (checker.run_item_live) run on audio as it arrives.

Every hop (0.5 s of audio) the model runs on the last 4 s; frames with at least 1 s of audio after them are final and
go to the checker's Viterbi decoder. The cursor (`at`) comes from the newest window's provisional frames as well
(follow_live.py), so it lags a word's start by about half a second. A word is decided once it is 0.5 s behind the
newest final frame, on the best path over the last 30 s, exactly as run_item_live decides it. A mark is sent once
its word is decided wrong; an `unmark` when the reciter goes back and says it right. Tajweed (and letters, when
asked) come per ayah, once every word of the ayah is decided. `end` is the whole take decided once more.

What this adds to run_item_live, all to serve a stream (none of it changes how a word is judged):
  - the decoder's tables grow as frames come (run_item_live knows the length in advance);
  - the passage is cut into segments of SEG_WORDS words: when the reciter nears a segment's end (or seeks, or a
    segment holds SEG_FRAMES frames), a new one starts at the first undecided word, from the frame the last decided
    word ended, with SEG_BACK words before it so a repeat is still a repeat. Memory and time per hop stay bounded
    on any passage length. Words before a segment's first word are never marked by it, only unmarked;
  - the traceback stops at the 30 s window instead of walking to the take's start (run_item_live cuts there after);
  - the greedy tokens (heard_tokens) are kept as frames come instead of recomputed on the whole take;
  - the words of the next segment (their sounds and look-alikes: about 25 ms a word, in pure Python) are worked out
    in a helper process while the reciter is still in this one, so starting it doesn't hold up a hop. A thread
    would hold the GIL and slow the hops themselves (one took 0.7 s).

Everything here is a function of the audio and of where in it each seek and dismissal arrived, so a session can be
run again from its audio (a resumed socket on another instance) and gives the same events.
"""
import concurrent.futures
import json
import multiprocessing
import time

import numpy as np

from engine import FPS, SAID, WORDS_P, BadRequest, heard_sounds, score, settings_of  # puts the harness on the path
import checker  # noqa: E402  (the harness's)

SR = 16000
LIVE = {'hop': 0.5, 'win': 4.0, 'look': 1.0, 'commit': 0.5, 'context': 30.0, 'stable': 1, 'skip_wait': 'start',
        'live_order': False}
SEG_WORDS = 96      # words in a segment's graph
SEG_FIRST = 40      # the first segment's (built on the first hop, before the helper can have worked any out)
SEG_BACK = 16       # words before a segment's first word, for repeats
SEG_MARGIN = 24     # a new segment starts when the cursor is this close to the segment's last word
SEG_FRAMES = 3 * 60 * FPS  # ...or when a segment has taken this many frames (3 minutes)
MAX_SECONDS = 15 * 60
EXTRA_STABLE = 2    # hops in a row an extra word must be there before it is shown
FIX_STABLE = 4      # hops in a row a marked word must be heard right again before it is unmarked
NEG = checker.Decoder.NEG
_pool = None


def secs(span):
    return [round(span[0] / FPS, 2), round(span[1] / FPS, 2)]


def word_rows(kws, statuses, flagged, visits, f0=0):
    """Engine.judge's word rows (every word decided) and the frames each heard word spans, plus f0 (a segment's
    first frame)."""
    spans, words = {}, []
    for i, kw in enumerate(kws):
        w = kw['word']
        stt = statuses.get(w, 'pending')
        if visits[i]:
            spans[w] = (f0 + min(v['start'] for v in visits[i]), f0 + max(v['end'] for v in visits[i]))
        if stt == 'pending':
            continue
        row = {'w': w, 'status': stt}
        f = flagged.get(w)
        if f:
            row['kind'] = f.get('kind')
            if f.get('heard'):
                row['heard'] = f['heard']
        if w in spans:
            row['t'] = secs(spans[w])
        words.append(row)
    return words, spans


def extra_rows(extras, fillers, kws, delay, f0=0):
    """decide()'s extras as v1 rows, each with the frames of its filler ('span')."""
    W = len(kws)
    out = []
    for e in extras:
        span = None
        for gi, a, b in fillers:
            if e.get('trail') and gi == W or not e.get('trail') and 0 < gi < W \
                    and kws[gi - 1]['word'] == e['after'] and abs(b / FPS + delay - e['t']) < 1e-6:
                span = [f0 + a, f0 + b]
                break
        out.append({'after': e['after'], 't': round(e['t'], 2), 'trail': bool(e.get('trail')), 'span': span})
    return out


def v1_extra(e):
    return {k: e[k] for k in ('after', 't', 'trail')}


# ------------------------------------------------------------ the helper process (the next segment's words)

class _VocabEar:
    """All checker.Key needs of the model: its sounds."""

    def __init__(self):
        cfg = checker.LAB / 'models/hisnlabs-tajweed-v2/config.json'
        self.vocab = json.loads(cfg.read_text())['phonemes']
        self.index = {p: i + 1 for i, p in enumerate(self.vocab)}


_KEY = None


def _helper_init():
    global _KEY
    _KEY = checker.Key(_VocabEar())


def _helper_words(lo, hi, alts, rule):
    return _KEY.passage(lo, hi, alts, rule)


def start_helper():
    """One helper process for this instance (call once, at start; without it, words are worked out in line)."""
    global _pool
    if _pool is None:
        _pool = concurrent.futures.ProcessPoolExecutor(1, mp_context=multiprocessing.get_context('spawn'),
                                                       initializer=_helper_init)
        _pool.submit(len, ()).result()  # started and ready
    return _pool




class Decoder(checker.Decoder):
    """checker.Decoder for a stream. Its tables grow as frames come; traceback() can stop at a frame (the live
    window); and it can start at a word inside its graph (`entry`; the words before are there for repeats):
      'after': as if the word before had just been said (its last blank holds the pause), so skipping the entry
               word costs what a skip costs from there;
      'lead':  as if a free lead had held everything until now (a seek: the reciter may say anything first)."""

    def __init__(self, g, P, entry=0, start='after', cap=1500):
        super().__init__(g, P, cap)
        self.entry, self.start = entry, start

    def _grow(self, n):
        need = self.t + n
        if need <= self.bp.shape[0]:
            return
        cap = max(need + 500, 2 * self.bp.shape[0])
        for name in ('bp', 'ent_src', 'gap_src', 'ex_state'):
            old = getattr(self, name)
            new = np.zeros((cap,) + old.shape[1:], old.dtype)
            new[:self.t] = old[:self.t]
            setattr(self, name, new)

    def feed(self, lp):
        if len(lp):
            self._grow(len(lp))
            super().feed(lp)

    def _step(self, e):
        first = self.t == 0
        super()._step(e)
        if first and self.entry:
            g = self.g
            self.d = np.full(g.S + 1, NEG)
            self.gap = np.full(g.W + 1, NEG)
            if self.start == 'after':
                ex = g.exits[self.entry - 1]
                ex = ex[(ex < g.S) & (g.lab[ex] == 0) & (g.alt_of[ex] < 0)]  # the word's own last blanks
                self.d[ex] = e[0]
            else:
                self.gap[self.entry] = float(e.max()) + self.pen[self.entry]

    def state(self):
        return self.d.copy(), self.gap.copy(), self.t

    def restore(self, s):
        self.d, self.gap, self.t = s

    def word_now(self):
        """The graph's word the best state is in now (for a filler, the word before it); None in a lead."""
        s, gi = int(np.argmax(self.d)), int(np.argmax(self.gap))
        if self.d[s] >= self.gap[gi]:
            return int(self.g.word_of[s])
        if gi == 0 or self.start == 'lead' and gi == self.entry:
            return None
        return gi - 1

    def traceback(self, final=True, since=0):
        """checker.Decoder.traceback, stopping at frame `since`."""
        g, P, W = self.g, self.P, self.g.W
        d, gap = self.d, self.gap
        vals = d[g.exits]
        am = vals.argmax(axis=1)
        if final:
            ex = vals[self.widx, am]
            ends = ex + P['stop']
            ends[W - 1] = ex[W - 1]
            if gap[W] >= ends.max():
                cur, score = ('gap', W), float(gap[W])
            else:
                w = int(np.argmax(ends))
                cur, score = ('state', int(g.exits[w, am[w]])), float(ends.max())
        else:
            s, gi = int(np.argmax(d)), int(np.argmax(gap))
            cur, score = (('state', s), float(d[s])) if d[s] >= gap[gi] else (('gap', gi), float(gap[gi]))
        path = []
        t = self.t - 1
        while t >= since:
            if cur[0] == 'gap':
                gi = cur[1]
                path.append((t, -(gi + 1), False))
                if t == since:
                    break
                if self.gap_src[t, gi] == 1:
                    cur = ('state', int(self.ex_state[t, gi - 1]))
                t -= 1
                continue
            s = cur[1]
            c = self.bp[t, s] if t > 0 else 4
            path.append((t, s, c == 4))
            if t == since:
                break
            if c == 4:
                w = int(g.word_of[s])
                kind, idx = divmod(int(self.ent_src[t, w]), 1_000_000)
                cur = ('state', int(self.ex_state[t, idx])) if kind in (1, 2, 4) else ('gap', idx)
            else:
                cur = ('state', s + {0: 0, 1: -1, 2: -2, 3: 1}[int(c)])
            t -= 1
        path.reverse()
        return path, score


class Segment:
    """App words [a, b) in one graph, decoded from frame f0; `first` is the first word it may mark."""

    def __init__(self, E, P, a, b, first, f0, start):
        self.a, self.b, self.first, self.f0, self.start = a, b, first, f0, start
        self.kws = E.passage_words(a, b)
        self.app = [k['word'] for k in self.kws]
        self.g = checker.Graph(self.kws)
        self.dec = Decoder(self.g, P, entry=first - a, start=start)

    def own_extra(self, e):
        """An extra word this segment may report: after its first word's predecessor or later, and not the pause
        a 'lead' start holds before the reciter begins."""
        if e['after'] < self.first - 1:
            return False
        return not (self.start == 'lead' and e['after'] == self.first - 1 and e['span'] and e['span'][0] == self.f0)

    def frames(self):
        return self.f0 + self.dec.t


class LiveSession:
    """One live check. feed() audio (PCM16 bytes), control() messages, finish() at the end; each returns the events
    to send, in order (dicts, recite-contract.md)."""

    def __init__(self, engine, s, a, s2=None, a2=None, settings=None):
        E = self.E = engine
        self.st = settings_of(settings or {})
        self.P = dict(WORDS_P, **LIVE)
        if (s2 is None) != (a2 is None):
            raise BadRequest('both or neither of s2, a2')
        self.lo, self.end = E.passage(s, a, s2, a2, max_words=10 ** 6)
        self.V = len(E.ear.vocab) + 1
        self.pcm = np.zeros(SR * 30, np.int16)
        self.n = 0                       # samples received
        self.lp = np.zeros((1500, self.V), np.float32)
        self.T = 0                       # final frames
        self.k = 0                       # hops done
        self.toks, self.tok_cut = [], 0  # greedy tokens before tok_cut (absolute peaks), final
        self.segs = []                   # finished segments' results
        self.seg = None
        self.origin = self.lo            # where the reciter started (or last seeked to): `said` counts from here
        self.status = {}                 # app word -> its latest decision (correct, corrected, wrong, missed)
        self.decided = {}                # app word -> audio seconds when first decided
        self.bad_run = {}
        self.flagged = {}                # app word -> audio seconds when marked
        self.bad_from = {}               # app word -> frame its mistake was heard (a later good visit unmarks it)
        self.spans = {}                  # app word -> (first frame, last frame) heard, absolute
        self.marks = {}                  # id -> Mark, shown now
        self.extra_run = {}
        self.good_run = {}
        self.dismissed = set()
        self.ayat_done = set()
        self.ctrl = []                   # (samples received when it came, message)
        self.sent = {'at': None, 'said': None, 'score': None}
        self.stopped = False
        self.result = None
        self.ms = {'model': 0.0, 'words': 0.0, 'tajweed': 0.0, 'hops': 0, 'worst_hop': 0.0}
        self.seg = None                  # built on the first hop: a new session answers at once

    # ------------------------------------------------------------ input

    def feed(self, data):
        """PCM 16-bit little-endian mono 16 kHz, any length (an odd byte at the end is dropped)."""
        if self.stopped:
            return []
        x = np.frombuffer(data[: len(data) // 2 * 2], '<i2')
        room = MAX_SECONDS * SR - self.n
        x = x[:max(0, room)]
        if self.n + len(x) > len(self.pcm):
            grown = np.zeros(max(self.n + len(x), 2 * len(self.pcm)), np.int16)
            grown[:self.n] = self.pcm[:self.n]
            self.pcm = grown
        self.pcm[self.n:self.n + len(x)] = x
        self.n += len(x)
        ev = self._run()
        if self.n >= MAX_SECONDS * SR:
            ev += self.finish(why='too_long')
        return ev

    def control(self, msg):
        """seek {w}, dismiss {id} or end: applied at this point of the audio."""
        self.ctrl.append((self.n, msg))
        return self._run()

    def finish(self, why='end'):
        """The rest of the audio, then the whole take decided once more: [..., done]."""
        if self.stopped:
            return []
        ev = self._run()
        self.stopped = True
        ev += self._hop(last=True)
        self.result = self._final()
        self.result['why'] = why
        ev.append({'type': 'done', 'result': self.result})
        return ev

    @property
    def seconds(self):
        return self.n / SR

    # ------------------------------------------------------------ hops

    def _run(self):
        ev = []
        hop = self.P['hop']
        while True:
            need = int(round((self.k + 1) * hop * SR))
            while self.ctrl and self.ctrl[0][0] < need:
                ev += self._apply(self.ctrl.pop(0)[1])
                if self.stopped:
                    return ev
            if need > self.n:
                return ev
            ev += self._hop()

    def _apply(self, msg):
        kind = msg.get('type')
        if kind == 'dismiss':
            mid = msg.get('id')
            if isinstance(mid, str) and len(mid) < 64:
                self.dismissed.add(mid)
                return self._score_event()
            return []
        if kind == 'seek':
            w = msg.get('w')
            if not isinstance(w, int) or not self.lo - SEG_WORDS <= w < self.end:
                return []
            _, ev = self._close_segment() if self.seg is not None else (None, [])
            self.origin = w
            self._start_segment(w, self.T, 'lead')
            return ev
        if kind in ('end', 'stop'):
            return self.finish()
        return []

    def _hop(self, last=False):
        """One hop: the model on the newest window, new final frames to the decoder, the cursor, decisions."""
        t0 = time.perf_counter()
        P = self.P
        k = self.k + 1
        t_end = self.n if last else min(int(round(k * P['hop'] * SR)), self.n)
        self.k = k
        s0 = max(0, t_end - int(P['win'] * SR))
        s0 -= s0 % 320
        T_all = (1 + t_end // 160) // 2
        hi = T_all if last else min(T_all, int((t_end / SR - P['look']) * FPS))
        prov = None
        if t_end - s0 >= 1600:
            lp = self.E.ear._run(self.pcm[s0:t_end].astype(np.float32) / 32768.0)
            f0 = s0 // 320
            if hi > self.T:
                rows = lp[self.T - f0:hi - f0]
                if len(rows) < hi - self.T:  # the model gave a frame or two fewer than expected at the very end
                    rows = np.concatenate([rows, np.repeat(lp[-1:], hi - self.T - len(rows), 0)])
                self._add_frames(rows)
            prov = None if last else lp[self.T - f0:]
        t1 = time.perf_counter()
        ev = self._decide(t_end / SR, prov)
        t2 = time.perf_counter()
        self.ms['model'] += (t1 - t0) * 1000
        self.ms['words'] += (t2 - t1) * 1000
        self.ms['hops'] += 1
        self.ms['worst_hop'] = max(self.ms['worst_hop'], (t2 - t0) * 1000)
        return ev

    def _add_frames(self, rows):
        if self.T + len(rows) > len(self.lp):
            grown = np.zeros((max(self.T + len(rows), 2 * len(self.lp)), self.V), np.float32)
            grown[:self.T] = self.lp[:self.T]
            self.lp = grown
        self.lp[self.T:self.T + len(rows)] = rows
        self.T += len(rows)

    def _tokens(self, f0, f1):
        """heard_tokens over frames f0..f1 (peaks relative to f0), keeping what can no longer change."""
        if f1 > self.tok_cut:
            am = self.lp[self.tok_cut:f1].argmax(axis=1)
            new = checker.heard_tokens(self.lp[self.tok_cut:f1])
            ch = np.nonzero(am[1:] != am[:-1])[0]
            last_run = self.tok_cut + (int(ch[-1]) + 1 if len(ch) else 0)  # the newest run may still grow
            done = [(c, self.tok_cut + pk, p) for c, pk, p in new if self.tok_cut + pk < last_run]
            tail = [(c, self.tok_cut + pk, p) for c, pk, p in new if self.tok_cut + pk >= last_run]
            self.toks += done
            self.tok_cut = last_run
        else:
            tail = []
        return [(c, pk - f0, p) for c, pk, p in self.toks + tail if f0 <= pk < f1]

    # ------------------------------------------------------------ segments

    def _start_segment(self, w, f0, start):
        a = max(0, w - SEG_BACK)
        b = min(self.end, max(w + 1, a + SEG_WORDS))
        self.seg = Segment(self.E, self.P, a, b, w, f0, start)
        self.seg.dec.feed(self.lp[f0:self.T])
        self._prefetch()

    def _prefetch(self):
        """Have the helper work out the words the next segment will add (it starts a little before this one
        ends). Changes no result: only how soon the next Segment is ready."""
        b = self.seg.b
        hi = min(self.end, b - SEG_MARGIN - SEG_BACK + SEG_WORDS + 8)
        E = self.E
        if _pool is None or E.table is not None or hi <= b or all(w in E._kw for w in range(b, hi)):
            return
        fut = _pool.submit(_helper_words, b, hi, int(self.P['alts']), self.P['alt_rule'])
        fut.add_done_callback(lambda f: f.exception() is None and E.remember(f.result()))

    def _close_segment(self):
        """End the segment after its furthest decided word c - 1 (not after the cursor: a reciter who went back is
        followed by the next segment's repeats). Its decisions for words [first, c), on its whole path, are kept for
        `end`; words in there the live window never settled are decided now (and marked when wrong). -> (c, events)"""
        seg = self.seg
        mine = [w for w in self.decided if seg.first <= w < seg.b]
        c = max(mine) + 1 if mine else seg.first
        ev = []
        if seg.dec.t >= 5 and c > seg.first:
            path, _ = seg.dec.traceback(final=False)
            res = self._segment_result(seg, path, c, self.P)
            self.segs.append(res)
            now = round(self.seconds, 2)
            for row in res['words']:
                w = row['w']
                if w in self.decided:
                    continue
                self.decided[w] = now
                self.status[w] = row['status']
                if row['status'] in ('wrong', 'missed') and (self.P['live_order'] or row.get('kind') != 'order'):
                    m = self._word_mark(row, {'kind': row.get('kind')} if row['status'] == 'wrong' else None)
                    self.flagged[w] = now
                    self.bad_from[w] = res['spans'][w][0] if w in res['spans'] else seg.frames()
                    if m['id'] not in self.marks:
                        self.marks[m['id']] = m
                        ev.append({'type': 'mark', 'mark': m, 't': now})
        return c, ev

    def _segment_result(self, seg, path, upto, P, refs=None):
        lp = self.lp[seg.f0:seg.frames()]
        st, fl, _, _, extras, visits, fillers = checker.decide(seg.kws, seg.g, lp, path, P, self.E.ear.vocab,
                                                               self._tokens(seg.f0, seg.frames()), refs=refs)
        words, spans = word_rows(seg.kws, st, fl, visits, seg.f0)
        keep = range(seg.first, upto)
        # words before the segment said again (not the start's own pause): a correction if said right
        back = {seg.app[w]: st[seg.app[w]] for w in range(seg.first - seg.a)
                if visits[w] and visits[w][-1]['start'] > 0}
        return {
            'words': [r for r in words if r['w'] in keep],
            'spans': {w: s for w, s in spans.items() if w in keep},
            'extras': [e for e in extra_rows(extras, fillers, seg.kws, P['delay'], seg.f0)
                       if e['trail'] or seg.own_extra(e) and e['after'] < upto],
            'back': back,
        }

    def _maybe_rebase(self, cur):
        seg = self.seg
        near_end = cur is not None and seg.b < self.end and cur >= seg.b - SEG_MARGIN
        if not near_end and seg.dec.t < SEG_FRAMES:
            return []
        if near_end and not any(seg.first <= w < seg.b for w in self.decided) and seg.dec.t < SEG_FRAMES:
            return []
        old_frames = seg.frames()
        c, ev = self._close_segment()
        # start where the last decided word ended (its frames are final), at most the 30 s window back
        f0 = self.spans[c - 1][1] if c - 1 in self.spans and c > seg.first else seg.f0
        f0 = min(self.T, max(f0, old_frames - int(self.P['context'] * FPS)))
        self._start_segment(c, f0, 'after' if c - 1 in self.decided else 'lead')
        return ev

    # ------------------------------------------------------------ decisions

    def _first_segment(self):
        self.seg = Segment(self.E, self.P, self.lo, min(self.end, self.lo + SEG_FIRST), self.lo, 0, 'first')
        self.seg.dec.feed(self.lp[:self.T])
        self._prefetch()

    def _decide(self, now, prov):
        if self.seg is None:
            self._first_segment()
        seg, P, E = self.seg, self.P, self.E
        dec = seg.dec
        if self.T > seg.frames():
            dec.feed(self.lp[seg.frames():self.T])
        ev = []
        # the cursor: the best state after the provisional frames too, then the decoder put back
        if dec.t >= 1:
            if prov is not None and len(prov):
                saved = dec.state()
                dec.feed(prov)
                cw = dec.word_now()
                dec.restore(saved)
            else:
                cw = dec.word_now()
            if cw is not None and seg.app[cw] != self.sent['at']:
                w = seg.app[cw]
                self.sent['at'] = w
                ev.append({'type': 'at', 'w': w, 't': round(now, 2)})
        else:
            cw = None
        if dec.t < 5:
            return ev

        cf, ctx = int(P['commit'] * FPS), int(P['context'] * FPS)
        lo_t = max(0, dec.t - ctx)
        path, _ = dec.traceback(final=False, since=lo_t)
        st, fl, _, _, extras, visits, fillers = checker.decide(seg.kws, seg.g, self.lp[seg.f0:seg.frames()], path, P,
                                                               E.ear.vocab, self._tokens(seg.f0, seg.frames()))
        app, W, entry = seg.app, seg.g.W, seg.first - seg.a
        for w in range(W):
            if visits[w]:
                self.spans[app[w]] = (seg.f0 + min(v['start'] for v in visits[w]),
                                      seg.f0 + max(v['end'] for v in visits[w]))
        seen = [w for w in range(W) if visits[w]]
        order = [w for _, w in sorted((v['start'], w) for w in seen for v in visits[w])]
        jumped = set()
        for wa, wb in zip(order, order[1:]):
            if wb > wa + 1:
                jumped.update(range(wa + 1, wb))
        new_marks = []
        if seen:
            w_first = min(seen)
            if lo_t > 0 and visits[w_first][0]['start'] <= lo_t + 1:
                w_first += 1  # its start is outside the window: judged at an earlier step
            for w in range(W):
                aw = app[w]
                if w < w_first or st.get(aw, 'pending') == 'pending':
                    continue
                if not visits[w] and w not in jumped:
                    continue
                if visits[w]:
                    end_f = visits[w][-1]['end']
                else:  # a word jumped over: once the word heard after it is over, not just begun
                    later = [v for ww in range(w + 1, W) for v in visits[ww]]
                    if not later:
                        continue
                    end_f = min(later, key=lambda v: v['start'])[P['skip_wait']]
                if end_f > dec.t - cf:
                    continue
                kind = fl.get(aw, {}).get('kind')
                bad = st[aw] in ('wrong', 'missed') and (P['live_order'] or kind != 'order')
                if w < entry:  # before the segment: decided by the one before; only a correction counts here
                    if visits[w] and visits[w][-1]['start'] > 0 and not bad:
                        ev += self._unmark_if_corrected(aw, seg.f0 + visits[w][-1]['start'], now)
                    continue
                self.decided.setdefault(aw, now)
                self.status[aw] = st[aw]
                self.bad_run[aw] = self.bad_run.get(aw, 0) + 1 if bad else 0
                if bad:
                    self.good_run[aw] = 0
                if bad and self.bad_run[aw] >= P['stable'] and aw not in self.flagged:
                    self.flagged[aw] = now
                    self.bad_from[aw] = seg.f0 + (visits[w][-1]['start'] if visits[w] else end_f)
                    row = {'w': aw, 'status': st[aw], 'kind': kind, 'heard': fl.get(aw, {}).get('heard')}
                    if visits[w]:
                        row['t'] = secs(self.spans[aw])
                    new_marks.append(self._word_mark(row, fl.get(aw)))
                elif not bad and visits[w]:
                    ev += self._unmark_if_corrected(aw, seg.f0 + visits[w][-1]['start'], now)
        # extra words: once their filler is behind the commit point, in EXTRA_STABLE hops in a row
        now_extra = set()
        for e in extra_rows(extras, fillers, seg.kws, P['delay'], seg.f0):
            if e['trail'] or not e['span'] or not seg.own_extra(e) or e['span'][1] - seg.f0 > dec.t - cf:
                continue
            now_extra.add(e['after'])
            self.extra_run[e['after']] = self.extra_run.get(e['after'], 0) + 1
            if self.extra_run[e['after']] == EXTRA_STABLE:
                new_marks.append(E.marks([], {}, {}, [v1_extra(e)], [], [])[0])
        for aw in list(self.extra_run):
            if aw not in now_extra:
                self.extra_run[aw] = 0
        for m in new_marks:
            if m['id'] not in self.marks:
                self.marks[m['id']] = m
                ev.append({'type': 'mark', 'mark': m, 't': round(now, 2)})
        t1 = time.perf_counter()
        ev += self._ayah_marks(now)
        self.ms['tajweed'] += (time.perf_counter() - t1) * 1000
        ev += self._maybe_rebase(cw + seg.a if cw is not None else None)
        ev += self._said_event(now)
        ev += self._score_event(now)
        return ev

    def _word_mark(self, row, fl):
        """The Mark of a word decided wrong or skipped (Engine.marks), with what was heard for a sound said wrong."""
        aw = row['w']
        heard = {}
        if row['status'] == 'wrong' and (fl or {}).get('kind', 'sound') == 'sound' and aw in self.spans:
            near = {w: self.spans[w] for w in (aw - 1, aw, aw + 1) if w in self.spans}
            heard = {aw: heard_sounds(near, self._tokens(0, self.T), self.E.ear.vocab).get(aw, '')}
        return self.E.marks([row], {aw: fl} if fl else {}, heard, [], [], [])[0]

    def _unmark_if_corrected(self, aw, visit_start, now):
        if aw not in self.bad_from or visit_start <= self.bad_from[aw]:
            self.good_run[aw] = 0
            return []
        self.good_run[aw] = self.good_run.get(aw, 0) + 1
        if self.good_run[aw] < FIX_STABLE:
            return []
        ev = []
        for mid in [m for m, mk in self.marks.items() if mk['w'] == aw and mk['kind'] in ('word', 'skipped')]:
            del self.marks[mid]
            ev.append({'type': 'unmark', 'id': mid, 'why': 'corrected', 't': round(now, 2)})
        self.status[aw] = 'corrected'
        self.flagged.pop(aw, None)
        self.bad_from.pop(aw, None)
        self.bad_run[aw] = 0
        return ev

    def _ayah_marks(self, now):
        """Tajweed (and letters) for each ayah whose words are all decided, once."""
        ev = []
        todo = {tuple(self.E.ayah_of(w)) for w in self.decided} - self.ayat_done
        for s, a in sorted(todo):
            first, n = self._ayah_bounds(s, a)
            if not all(w in self.decided for w in range(first, first + n)):
                continue
            self.ayat_done.add((s, a))
            if first < self.lo or first + n > self.end or not self._said_in_full(first, n, self.status, self.spans):
                continue
            tj, letters = self.E.ayah_notes(self.lp[:self.T], s, a, self.status, self.spans, self.st)
            marks = self.E.marks([], {}, {}, [], tj, letters if self.st['letters'] else [])
            for m in marks:
                if m['id'] not in self.marks:
                    self.marks[m['id']] = m
                    ev.append({'type': 'mark', 'mark': m, 't': round(now, 2)})
            ev.append({'type': 'ayah', 's': s, 'a': a, 't': round(now, 2)})
        return ev

    def _ayah_bounds(self, s, a):
        v = self.E.words.vindex[(s, a)]
        return self.E.words.first[v], self.E.words.counts[v]

    @staticmethod
    def _said_in_full(first, n, statuses, spans):
        """As Engine.ayah_notes asks: every word said, and the first and last heard."""
        return all(statuses.get(w) in SAID for w in range(first, first + n)) and first in spans \
            and first + n - 1 in spans

    def _said_event(self, now):
        w = self.origin
        while w in self.decided:
            w += 1
        if w == self.origin:
            return []
        said = (w - 1, len(self.decided))
        if said == self.sent['said']:
            return []
        self.sent['said'] = said
        return [{'type': 'said', 'upTo': said[0], 't': round(now, 2)}]

    def _score_event(self, now=None):
        sc = score(self.status, list(self.marks.values()), self.dismissed)
        key = (sc['reached'], sc['mistakes'], sc['tajweed'])
        if key == self.sent['score'] or not sc['reached']:
            return []
        self.sent['score'] = key
        ev = {'type': 'score', **sc}
        ev['t'] = round(self.seconds if now is None else now, 2)
        return [ev]

    # ------------------------------------------------------------ the end

    def _final(self):
        """The whole take decided once more (run_item_live's final, per segment): the v2 answer."""
        seg, P = self.seg, self.P
        PF = dict(P, delay=P['look'] + P['commit'])
        results = list(self.segs)
        if seg is not None and seg.dec.t >= 5:
            at_end = seg.b == self.end
            path, _ = seg.dec.traceback(final=at_end)
            refs = checker.trail_refs(self.end) if at_end and P.get('trail_extra') else None
            results.append(self._segment_result(seg, path, seg.b, PF, refs))
        rows, spans, extras = {}, {}, []
        for r in results:
            for row in r['words']:
                rows[row['w']] = row
            spans.update(r['spans'])
            extras += r['extras']
        for r in results:  # a word said again, right, in a later segment: corrected
            for w, stt in r['back'].items():
                if w in rows and rows[w]['status'] in ('wrong', 'missed') and stt in ('correct', 'corrected'):
                    rows[w] = {'w': w, 'status': 'corrected', **({'t': rows[w]['t']} if 't' in rows[w] else {})}
        words = [rows[w] for w in sorted(rows)]
        statuses = {r['w']: r['status'] for r in words}
        flagged = {r['w']: {'kind': r.get('kind')} for r in words if r['status'] == 'wrong'}
        spans = {w: s for w, s in spans.items() if s}
        t0 = time.perf_counter()
        tj, letters = [], []
        done = set()
        for r in words:
            s, a = self.E.ayah_of(r['w'])
            if (s, a) in done:
                continue
            done.add((s, a))
            first, n = self._ayah_bounds(s, a)
            if first < self.lo or first + n > self.end:
                continue
            o, l_ = self.E.ayah_notes(self.lp[:self.T], s, a, statuses, spans, self.st)
            tj += o
            letters += l_
        self.ms['tajweed'] += (time.perf_counter() - t0) * 1000
        seen, ex = set(), []
        for e in extras:
            if e['after'] not in seen:
                seen.add(e['after'])
                ex.append(v1_extra(e))
        out = {
            'v': 1, 'from': self.lo, 'to': self.end, 'secs': round(self.seconds, 1), 'words': words, 'extras': ex,
            'tajweed': [{k: r[k] for k in r if not k.startswith('_')} for r in tj],
            'letters': [{k: r[k] for k in r if not k.startswith('_')} for r in letters] if self.st['letters'] else None,
            'settings': {k: self.st[k] for k in ('mon', 'mot', 'aar', 'letters')},
            'ms': {k: int(v) for k, v in self.ms.items()},
        }
        heard = heard_sounds(spans, self._tokens(0, self.T), self.E.ear.vocab)
        out['marks'] = self.E.marks(words, flagged, heard, ex, tj, letters if self.st['letters'] else [])
        out['score'] = score(statuses, out['marks'], self.dismissed)
        out['v'] = 2
        return out
