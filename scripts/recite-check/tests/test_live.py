"""The live checker with the real model (skipped where the model isn't there):
  - the streaming decoder's traceback is the checker's own, cut at the window;
  - on noise, a session runs from start to `end` and answers in the v2 shape (also runs in the image build);
  - on a public reciter's recitation with a planted wrong word and skip (the lab's bench-v0, when RECITE_BENCH or
    ~/revisely-mistake-lab/data/bench-v0 has it): both are marked, live and at the end;
  - events depend on the audio only: any chunk size, and a session run again from its messages, give the same.
"""
import json
import os
import pathlib
import sys
import unittest
import unittest.mock
import wave

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
LAB = pathlib.Path(os.environ.get('LAB', HERE / 'lab'))
MODEL = LAB / 'models/hisnlabs-tajweed-v2/onnx/model-int8.onnx'
BENCH = pathlib.Path(os.environ.get('RECITE_BENCH', pathlib.Path.home() / 'revisely-mistake-lab/data/bench-v0/items'))
ITEM = BENCH / 'alafasy.p2.m1.clean.json'  # Al-Fatiha; planted: word 4 said as another word, word 14 skipped
CLEAN = BENCH / 'alafasy.p2.clean.clean.json'  # Al-Fatiha as recited, no mistakes
# the lab's bench_endings.py: bench-v0's passages with ayah endings swapped for nearby ones, from the same recordings
ENDINGS = pathlib.Path(os.environ.get('RECITE_BENCH_ENDINGS',
                                      pathlib.Path.home() / 'revisely-mistake-lab/data/bench-endings/items'))

E = None


def engine():
    global E
    if E is None:
        from engine import Engine
        E = Engine(2)
    return E


def noise(seconds, seed=0):
    rng = np.random.default_rng(seed)
    return (rng.standard_normal(int(seconds * 16000)) * 800).astype('<i2').tobytes()


def bench_pcm():
    with wave.open(str(ITEM.with_suffix('.wav'))) as w:
        return w.readframes(w.getnframes())


def run(sess, messages):
    """messages: bytes (audio) or dicts (seek, dismiss, stop), in the order the phone sent them."""
    ev = []
    for m in messages:
        ev += sess.feed(m) if isinstance(m, bytes) else sess.control(m)
    return [strip(e) for e in ev]


def strip(e):
    if e['type'] == 'done':
        e = dict(e, result={k: v for k, v in e['result'].items() if k != 'ms'})
    return e


def chunks(pcm, size):
    return [pcm[i:i + size] for i in range(0, len(pcm), size)]


@unittest.skipUnless(MODEL.exists(), 'the model is not here')
class Model(unittest.TestCase):
    def test_traceback_is_the_checkers_cut_at_the_window(self):
        import checker
        import live
        E = engine()
        lp = E.ear._run(np.frombuffer(noise(12), '<i2').astype(np.float32) / 32768)
        kws = E.key.passage(0, 29, 4, 'skeleton')
        g = checker.Graph(kws)
        P = dict(live.WORDS_P, **live.LIVE)
        ref = checker.Decoder(g, P, lp.shape[0])
        ref.feed(lp)
        mine = live.Decoder(g, P, cap=10)  # starts small: the tables grow
        for i in range(0, lp.shape[0], 25):
            mine.feed(lp[i:i + 25])
        for final in (True, False):
            want, ws = ref.traceback(final)
            got, gs = mine.traceback(final)
            self.assertEqual((got, gs), (want, ws))
            self.assertEqual(mine.traceback(final, since=200)[0], [p for p in want if p[0] >= 200])

    def test_the_fast_step_is_the_checkers_step_to_the_bit(self):
        import checker
        import live
        E = engine()
        sources = [np.frombuffer(noise(20, seed=3), '<i2')]
        if ITEM.exists():
            sources.append(np.frombuffer(bench_pcm()[: 16000 * 2 * 40], '<i2'))
        P = dict(live.WORDS_P, **live.LIVE)
        for x in sources:
            lp = E.ear.logprobs(x.astype(np.float32) / 32768)
            for lo, n in ((0, 29), (0, 96), (5000, 60)):  # short, a full segment, a passage mid-surah
                g = checker.Graph(E.key.passage(lo, lo + n, 4, 'skeleton'))
                ref = checker.Decoder(g, P, lp.shape[0])
                mine = live.Decoder(g, P, cap=10)
                for f in range(lp.shape[0]):
                    ref.feed(lp[f:f + 1])
                    mine.feed(lp[f:f + 1])
                    self.assertTrue(np.array_equal(ref.d, mine.d) and np.array_equal(ref.gap, mine.gap), (lo, n, f))
                T = lp.shape[0]
                for name in ('bp', 'ent_src', 'gap_src', 'ex_state'):
                    self.assertTrue(np.array_equal(getattr(ref, name)[:T], getattr(mine, name)[:T]), name)
                self.assertEqual(ref.traceback(True), mine.traceback(True))
                # the cursor's scores-only frames: the same scores, nothing else touched
                probe = live.Decoder(g, P, cap=10)
                probe.feed(lp[:T // 2])
                saved, tables = probe.state(), probe.bp.copy()
                probe.feed_scores(lp[T // 2:T // 2 + 50])
                full = live.Decoder(g, P, cap=10)
                full.feed(lp[:T // 2 + 50])
                self.assertTrue(np.array_equal(probe.d, full.d) and np.array_equal(probe.gap, full.gap))
                probe.restore(saved)
                self.assertTrue(np.array_equal(probe.bp, tables))

    def test_a_session_on_noise_ends_with_a_v2_answer(self):
        import live
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {'letters': '1'})
        ev = run(sess, chunks(noise(6), 3200) + [{'type': 'end'}])
        self.assertEqual(ev[-1]['type'], 'done')
        res = ev[-1]['result']
        for k in ('v', 'marks', 'score', 'words', 'extras', 'tajweed', 'letters', 'secs', 'from', 'to', 'why'):
            self.assertIn(k, res)
        self.assertEqual((res['v'], res['secs'], res['why']), (2, 6.0, 'end'))
        self.assertTrue(sess.stopped)
        self.assertEqual(sess.feed(noise(1)), [])

    def test_the_word_table_holds_what_the_checker_works_out(self):
        import pickle
        import tempfile
        import engine as engine_mod
        import make_words
        E = engine()
        with tempfile.TemporaryDirectory() as d:
            cwd = os.getcwd()
            os.chdir(d)
            try:
                n = engine_mod.Engine.word_count(E.key) // 30  # a slice of 30 words: words 0-29
                make_words.part(0, n, gcs=False)
                part = pathlib.Path(d) / f'words-00-of-{n:02d}.pkl'
                make_words.merge(str(pathlib.Path(d) / 'words.bin'), [str(part)])
                table = pickle.loads((pathlib.Path(d) / 'words.bin').read_bytes())
            finally:
                os.chdir(cwd)
        saved = E.table
        try:
            E.table = table
            from_table = E.passage_words(0, 29)
        finally:
            E.table = saved
        self.assertEqual(from_table, E.key.passage(0, 29, int(engine_mod.WORDS_P['alts']), engine_mod.WORDS_P['alt_rule']))

    def test_a_word_the_checker_refuses_is_refused_from_the_table_too(self):
        import pickle
        E = engine()
        blobs = [pickle.dumps(E.key.passage(0, 1, 4, 'skeleton')[0]), pickle.dumps(('refused', '1:1 is odd'))]
        table = {'offsets': [0, len(blobs[0]), len(blobs[0]) + len(blobs[1])], 'blob': b''.join(blobs)}
        saved = E.table
        try:
            E.table = table
            self.assertEqual(len(E.passage_words(0, 1)), 1)
            with self.assertRaisesRegex(ValueError, 'odd'):
                E.passage_words(0, 2)
        finally:
            E.table = saved

    def test_the_four_ayat_with_a_joined_word_check_and_stream(self):
        """2:181, 8:6, 13:37 and 37:130 broke the checker (quran_transcript splits a word the mushaf writes as one;
        fixed at c01f4ea0): a check or a live session near them failed with `server`."""
        import live
        E = engine()
        x = np.frombuffer(noise(4, seed=7), '<i2')
        for s, a in ((2, 181), (8, 6), (13, 37), (37, 130)):
            first, n = E.words.first[E.words.vindex[(s, a)]], E.words.counts[E.words.vindex[(s, a)]]
            self.assertEqual(len(E.passage_words(first, first + n)), n)
            res = E.check(x.astype(np.float32) / 32768, s, a - 1 if a > 1 else a, s, a + 1, {}, v=2)
            self.assertEqual(res['v'], 2)
            sess = live.LiveSession(E, s, a - 1 if a > 1 else a, s, a + 1, {})
            ev = run(sess, chunks(x.tobytes(), 3200) + [{'type': 'end'}])
            self.assertEqual(ev[-1]['type'], 'done')

    def test_a_big_cursor_move_waits_for_the_next_hop(self):
        """A one-hop slip back (Majd's Recite take: 13 words back for one hop) never shows; a repeat or a skip shows a
        hop later; small moves and a seek show at once."""
        import live
        sess = live.LiveSession(engine(), 1, 1, 2, 10, {}, follow=True)

        def hop(w):
            got = sess._cursor(w)
            if got is not None:
                sess.sent['at'] = got
            return got
        self.assertEqual([hop(w) for w in (0, 1, 2, 2, 4)], [0, 1, 2, None, 4])  # moving on: at once
        self.assertEqual([hop(w) for w in (20, 21)], [None, 21])  # 16 ahead: waits a hop, shown when the next agrees
        self.assertEqual([hop(w) for w in (8, 22)], [None, 22])  # a slip 13 back for one hop: never shown
        self.assertEqual([hop(w) for w in (10, 10, 11)], [None, 10, 11])  # a repeat from word 10: a hop later
        self.assertEqual(hop(9), 9)  # one or two words back (the reciter going over a word): at once
        sess._seeked = True
        self.assertEqual(hop(40), 40)  # the phone moved the reader there: at once
        self.assertEqual(hop(5), None)  # and the rule holds again after it

    def test_a_lazim_madd_is_judged_on_time_only(self):
        """A lazim madd read short is marked only when the reciter's pace was measured in the ayah: alone, الٓمٓ has no
        short syllables, and the model's own count reads long madds short (Majd's three takes, Nov 14 2026)."""
        E = engine()
        import engine as engine_mod  # (it puts the harness's tajweed on the path)
        tajweed = engine_mod.tajweed
        first = E.words.first[E.words.vindex[(2, 1)]]
        statuses, spans = {first: 'correct'}, {first: (20, 300)}
        lp = np.zeros((400, len(E.ear.vocab) + 1), np.float32)
        row = {'kind': 'Lazem Madd', 'word': 0, 'tcount': 2.2, 'golden': 6, 'margin': 0.0}
        for timing, marked in ((None, False), (3.0, True)):
            judged = [dict(row, timing_v=timing)]
            with unittest.mock.patch.object(tajweed, 'judge', lambda *a, **k: judged), \
                    unittest.mock.patch.object(E, 'ear2', None):
                tj, _ = E.ayah_notes(lp, 2, 1, statuses, spans, {'letters': True, 'tajweed': True, 'mon': 4, 'mot': 4, 'aar': 0})
            self.assertEqual([r['rule'] for r in tj] == ['madd_lazim'], marked, (timing, tj))

    def test_refuses_a_passage_that_does_not_exist(self):
        import live
        from engine import BadRequest
        with self.assertRaises(BadRequest):
            live.LiveSession(engine(), 1, 8, None, None, {})
        with self.assertRaises(BadRequest):
            live.LiveSession(engine(), 2, 5, 2, 1, {})

    def counting_level(self, **bars):
        """A words level (Engine.level) on the released model that counts its runs, with its own word settings."""
        import engine as engine_mod
        E = engine()

        class Counting:
            def __init__(self, ear):
                self.ear, self.calls, self.vocab, self.index = ear, 0, ear.vocab, ear.index

            def _run(self, x):
                self.calls += 1
                return self.ear._run(x)

            def logprobs(self, x):
                self.calls += 1
                return self.ear.logprobs(x)
        return engine_mod.Level('test', Counting(E.ear), dict(E.bars, **bars),
                                dict(engine_mod.WORDS_P, alt_pen=-3.0))

    def test_each_level_runs_its_own_model(self):
        """Recite and Words & harakat run on the words level's model (v6 in the image) with its word settings; Strict
        on the released model (and v5). One model a take: the other is never run."""
        import engine as engine_mod
        import live
        E = engine()
        lv = self.counting_level()
        pcm = noise(6)
        with unittest.mock.patch.object(E, 'words_level', lv):
            for settings, follow, mine in (({'tajweed': '0', 'letters': '1'}, False, True), ({}, True, True),
                                           ({'tajweed': '0'}, False, True), ({}, False, False),
                                           ({'letters': '1'}, False, False)):
                lv.ear.calls = 0
                sess = live.LiveSession(E, 1, 1, 1, 7, settings, follow=follow)
                run(sess, chunks(pcm, 3200) + [{'type': 'end'}])
                self.assertEqual(sess.lv is lv, mine, settings)
                self.assertEqual(lv.ear.calls > 0, mine, settings)
                self.assertEqual(sess.P['alt_pen'], -3.0 if mine else engine_mod.WORDS_P['alt_pen'])
            x = np.frombuffer(noise(3), '<i2').astype(np.float32) / 32768
            lv.ear.calls = 0
            E.check(x, 1, 1, 1, 7, {'tajweed': '0', 'letters': '1'}, v=2)
            self.assertEqual(lv.ear.calls, 1)
            E.check(x, 1, 1, 1, 7, {}, v=2)
            self.assertEqual(lv.ear.calls, 1)
            self.assertEqual(E.ears()['harakat'], 'test')
            self.assertTrue(E.ears()['strict'].startswith('released'))
        with unittest.mock.patch.object(E, 'words_level', None):  # an image without v6: every level on the released
            self.assertIs(live.LiveSession(E, 1, 1, 1, 7, {'tajweed': '0'}).lv, E.released)
            self.assertIs(live.LiveSession(E, 1, 1, 1, 7, {}, follow=True).lv, E.released)

    def test_side_frames_are_the_same_whoever_works_them_out(self):
        """The released model's frames for naming a v6 take (SideFrames): chunks the background thread worked out as
        the take went and chunks worked out at the end are the same frames, each chunk's own, run on its audio with
        SIDE_CONTEXT either side (a chunk not yet whole when the take ends runs to its end); any piece read on its own
        is that piece of the whole."""
        import concurrent.futures
        import engine as engine_mod
        E = engine()
        pcm = np.frombuffer(noise(13.3, seed=5), '<i2')
        x = pcm.astype(np.float32) / 32768
        n, T = len(x), (1 + len(x) // 160) // 2

        def audio(s0, s1):
            return x[s0:s1].copy()

        def now(fn, *args):
            f = concurrent.futures.Future()
            f.set_result(fn(*args))
            return f
        live_ = engine_mod.SideFrames(E.ear, audio, now)
        for k in range(0, n, 1600):
            live_.feed(min(n, k + 1600))
        self.assertEqual(live_.next, 1)  # 0–8 s was whole by 13.3 s (with 2 s after it); 8–13.3 s wasn't
        end = engine_mod.SideFrames(E.ear, audio)
        end.feed(n)
        got = [s.get(0, T) for s in (live_, end)]
        self.assertEqual(got[0].shape, (T, len(E.ear.vocab) + 1))
        self.assertTrue(np.array_equal(got[0], got[1]))
        self.assertGreater(live_.ms, 0)  # 8–13.3 s was worked out at the end
        piece = engine_mod.SideFrames(E.ear, audio)
        piece.feed(n)
        self.assertTrue(np.array_equal(piece.get(150, 450), got[1][150:450]))  # across the edge, read on its own
        self.assertEqual(engine_mod.SideFrames.span(0, n), (0, 160000, 0, 400))
        self.assertEqual(engine_mod.SideFrames.span(1, n), (96000, n, 400, T))
        for j in range(2):
            s0, s1, a, b = engine_mod.SideFrames.span(j, n)
            own = E.ear._run(x[s0:s1])[a - s0 // 320:b - s0 // 320]
            self.assertTrue(np.array_equal(got[1][a:a + len(own)], own), j)

    def test_a_v6_take_names_on_the_released_models_frames(self):
        """A take on the words level (v6) names its slips on the released model's frames, with the released model's
        settings: worked out from the take's audio (a check) or as it streamed (live), only around its runs."""
        import engine as engine_mod
        import live
        E = engine()
        if E.table is None:
            self.skipTest('no word table for these words: nothing is named without it')
        lv = self.counting_level()
        seen = []
        real = E.name_slips

        def spy(marks, lp, order, statuses, spans, extras, lv_=None, frames=None):
            seen.append((lv_, frames))
            return real(marks, lp, order, statuses, spans, extras, lv_, frames)
        pcm = noise(6)
        x = np.frombuffer(pcm, '<i2').astype(np.float32) / 32768
        with unittest.mock.patch.object(E, 'words_level', lv), unittest.mock.patch.object(E, 'name_slips', spy):
            E.check(x, 1, 1, 1, 7, {'tajweed': '0'}, v=2)
            E.check(x, 1, 1, 1, 7, {}, v=2)
            sess = live.LiveSession(E, 1, 1, 1, 7, {'tajweed': '0'})
            run(sess, chunks(pcm, 3200) + [{'type': 'end'}])
            self.assertIsInstance(sess.side, engine_mod.SideFrames)
            self.assertIn('side', sess.result['ms'])
            self.assertIsNone(live.LiveSession(E, 1, 1, 1, 7, {}).side)  # Strict: its own frames
            self.assertIsNone(live.LiveSession(E, 1, 1, 1, 7, {}, follow=True).side)  # Recite names nothing
            with unittest.mock.patch.dict(os.environ, {'RECITE_SIDE_FRAMES': '0'}):
                self.assertIsNone(live.LiveSession(E, 1, 1, 1, 7, {'tajweed': '0'}).side)
        self.assertEqual([(a is lv, isinstance(b, engine_mod.SideFrames)) for a, b in seen],
                         [(True, True), (False, False), (True, True)])

    def test_naming_redecodes_within_its_work(self):
        """A run's re-decode for naming costs frames x (graph states + NAME_STATE_COST); one that doesn't fit what is
        left of the take's NAME_WORK is skipped and costs nothing (a cut take's 41 runs, joined into one 160 s run,
        waited 5.4 s after Stop on Cloud Run)."""
        import engine as engine_mod
        E = engine()
        lp = np.zeros((1600, len(E.ear.vocab) + 1), np.float32)
        spans = {w: (100 + 40 * k, 130 + 40 * k) for k, w in enumerate(range(0, 29))}
        work = {'left': 1e9, 'decode': 1000}
        self.assertIsNone(E._decode_plain(lp, 0, 29, spans, work))
        self.assertEqual(work['decode'], 1000)
        work = {'left': 1e9, 'decode': engine_mod.NAME_WORK}
        self.assertIsNotNone(E._decode_plain(lp, 0, 29, spans, work))
        g = engine_mod.checker.Graph(E.passage_words(0, 29))
        frames = min(len(lp), 130 + 40 * 28 + engine_mod.NAME_PAD) - (100 - engine_mod.NAME_PAD)
        self.assertEqual(engine_mod.NAME_WORK - work['decode'], frames * (g.S + engine_mod.NAME_STATE_COST))

    def test_letters_are_judged_against_the_levels_own_bars(self):
        """An ayah's letters on the words level use its bars (bars.v6.json), Strict's the released model's."""
        import engine as engine_mod
        E = engine()
        lv = self.counting_level(letters={'bar': E.bars['letters']['bar'] + 100, 'shadda_max': 1.0})
        first = E.words.first[E.words.vindex[(1, 2)]]
        n = E.words.counts[E.words.vindex[(1, 2)]]
        statuses = {first + i: 'correct' for i in range(n)}
        spans = {first + i: (20 + 40 * i, 50 + 40 * i) for i in range(n)}
        lp = np.zeros((400, len(E.ear.vocab) + 1), np.float32)
        score = E.bars['letters']['bar'] + 1  # past the released bar, under the test level's
        rows = [[(score, 'ص→س', None, 'س')] for _ in range(n)]
        got = {}
        with unittest.mock.patch.object(E, 'words_level', lv), \
                unittest.mock.patch.object(engine_mod.letters_v2, 'words_judge', lambda *a, **k: rows), \
                unittest.mock.patch.object(engine_mod.tajweed, 'judge', lambda *a, **k: []), \
                unittest.mock.patch.object(E, 'ear2', None):
            for name, st in (('harakat', {'letters': True, 'tajweed': False}),
                             ('strict', {'letters': True, 'tajweed': True})):
                _, letters = E.ayah_notes(lp, 1, 2, statuses, spans, dict(st, mon=4, mot=4, aar=0))
                got[name] = len(letters)
        self.assertEqual(got, {'harakat': 0, 'strict': n})


@unittest.skipUnless(MODEL.exists() and ITEM.exists(), 'the model or the bench recitation is not here')
class Bench(unittest.TestCase):
    def session(self):
        import live
        return live.LiveSession(engine(), 1, 1, 1, 7, {})

    def test_planted_mistakes_are_marked_live_and_at_the_end(self):
        """Word 4 (ٱلْحَمْدُ) said as «إِيَّاكَ» is marked skipped: since the decoder can go back from a filler (gap_back,
        Nov 16 2026), «إِيَّاكَ» is heard as a dropped try at the next word, «لِلَّهِ», which is then said right. Before,
        it was marked as a word said wrong."""
        ev = run(self.session(), chunks(bench_pcm(), 3200) + [{'type': 'end'}])
        live_marks = {e['mark']['w']: e['mark'] for e in ev if e['type'] == 'mark'}
        self.assertEqual(live_marks[14]['kind'], 'skipped')
        self.assertEqual(live_marks[4]['kind'], 'skipped')
        end = ev[-1]['result']
        self.assertEqual({(m['w'], m['kind']) for m in end['marks'] if m['kind'] != 'tajweed'},
                         {(4, 'skipped'), (14, 'skipped')})
        self.assertEqual((end['words'][0]['w'], end['words'][-1]['w']), (0, 28))
        self.assertEqual({k: end['score'][k] for k in ('reached', 'mistakes', 'accuracy')},
                         {'reached': 29, 'mistakes': 2, 'accuracy': round(1 - 2 / 29, 4)})
        # the cursor walks the passage; `said` follows it (the last word, said as the audio ends, is `end`'s)
        ats = [e['w'] for e in ev if e['type'] == 'at']
        self.assertEqual((ats[0], ats[-1]), (0, 28))
        self.assertGreaterEqual([e for e in ev if e['type'] == 'said'][-1]['upTo'], 27)
        self.assertEqual(end['words'][-1]['w'], 28)
        # a mark comes once its word is decided: after it was said, a few seconds at most
        t14 = next(e['t'] for e in ev if e['type'] == 'mark' and e['mark']['w'] == 14)
        self.assertLess(t14, 30.0)

    def test_a_passage_with_no_end_gives_the_same_answer(self):
        """The server runs a take with no end to 114:6 (server.LAST_AYAH): on a take that stops at the end of
        Al-Fatiha, the same mistakes, nothing reached past it, and the cursor ends on its last word."""
        import live
        ev = run(live.LiveSession(engine(), 1, 1, 114, 6, {}, open_end=True), chunks(bench_pcm(), 3200)
                 + [{'type': 'end'}])
        end = ev[-1]['result']
        self.assertEqual((end['from'], end['to']), (0, 29))  # the ayat reached, not the Qur'an
        self.assertEqual({(m['w'], m['kind']) for m in end['marks'] if m['kind'] != 'tajweed'},
                         {(4, 'skipped'), (14, 'skipped')})
        self.assertEqual(max(w['w'] for w in end['words']), 28)
        self.assertEqual([e['w'] for e in ev if e['type'] == 'at'][-1], 28)
        self.assertEqual(end['score']['reached'], 29)

    def test_a_snapshot_holds_what_the_phone_should_show(self):
        sess = self.session()
        ev = run(sess, chunks(bench_pcm()[: 16000 * 2 * 35], 3200))
        snap = sess.snapshot()
        marks = {e['mark']['id'] for e in ev if e['type'] == 'mark'} - {e['id'] for e in ev if e['type'] == 'unmark'}
        self.assertEqual({e['mark']['id'] for e in snap if e['type'] == 'mark'}, marks)
        last = {k: [e for e in ev if e['type'] == k][-1] for k in ('at', 'said', 'score')}
        got = {e['type']: e for e in snap if e['type'] in ('at', 'said', 'score')}
        self.assertEqual(got['at']['w'], last['at']['w'])
        self.assertEqual(got['said']['upTo'], last['said']['upTo'])
        self.assertEqual({k: got['score'][k] for k in ('reached', 'mistakes')},
                         {k: last['score'][k] for k in ('reached', 'mistakes')})

    def test_follow_mode_sends_the_cursor_and_said_but_no_marks_or_score(self):
        """…and `off` (the hidden view's next word, when something else is said there: word 4 here)."""
        import live
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {'letters': '1'}, follow=True)
        ev = run(sess, chunks(bench_pcm(), 3200) + [{'type': 'end'}])
        self.assertEqual({e['type'] for e in ev} - {'at', 'said', 'ayah', 'done', 'off'}, set())
        res = ev[-1]['result']
        self.assertEqual((res['marks'], res['score']), ([], None))  # the contract's shape, empty
        self.assertEqual(res['settings']['letters'], False)
        self.assertEqual({w['w']: w['status'] for w in res['words']}[14], 'missed')  # words are still decided
        self.assertEqual([e for e in ev if e['type'] == 'said'][-1]['upTo'] >= 27, True)

    def test_hints_mark_words_helped_without_changing_mistakes(self):
        pcm = bench_pcm()
        log = chunks(pcm[:16000 * 2 * 20], 3200) + [{'type': 'hint', 'w': 20, 'what': 'word'},
                                                    {'type': 'hint', 'w': 22, 'what': 'ayah'}] \
            + chunks(pcm[16000 * 2 * 20:], 3200) + [{'type': 'end'}]
        ev = run(self.session(), log)
        res = ev[-1]['result']
        helped = sorted(w['w'] for w in res['words'] if w.get('helped'))
        self.assertEqual(helped, [20, 22, 23, 24, 25, 26, 27, 28])  # 1:7 runs to word 28
        self.assertEqual(res['score']['helped'], 8)
        self.assertEqual(res['score']['mistakes'], 2)
        self.assertEqual([e for e in ev if e['type'] == 'score'][-1]['helped'], 8)

    def test_strict_hands_the_take_to_the_second_model(self):
        """With v5 loaded (#539), ayah_notes gets the take's samples, on the frames' grid; without it, nothing."""
        import live
        E = engine()
        seen = []
        real = E.ayah_notes

        def notes(lp, s, a, statuses, spans, st, audio=None, readings=None):
            seen.append(None if audio is None else len(audio))
            return real(lp, s, a, statuses, spans, st, readings=readings)
        pcm = bench_pcm()[: 16000 * 2 * 20]
        with unittest.mock.patch.object(E, 'ayah_notes', notes), unittest.mock.patch.object(E, 'ear2', object(),
                                                                                             create=True):
            sess = live.LiveSession(E, 1, 1, 1, 7, {})
            run(sess, chunks(pcm, 3200) + [{'type': 'end'}])
            self.assertTrue(sess.v5 and seen and all(n is not None for n in seen))
            self.assertEqual(seen[-1], len(pcm) // 2)
            np.testing.assert_allclose(sess.xf[:sess.n], np.frombuffer(pcm, '<i2') / 32768.0)
            seen.clear()
            sess = live.LiveSession(E, 1, 1, 1, 7, {'tajweed': '0'})  # words and harakat: no second model
            run(sess, chunks(pcm, 3200) + [{'type': 'end'}])
            self.assertFalse(sess.v5)
            self.assertTrue(all(n is None for n in seen))

    def test_with_defer_judging_an_ayah_never_holds_up_the_cursor(self):
        """The server's setting, at both levels: each ayah's letters and tajweed are worked out on their own thread and
        come out at least AYAH_DUE seconds of audio after the ayah. The same events for any chunk size and however
        long the thread takes (held back, the chunks are still answered); the same marks, ayat, cursor and `done` as
        in the hop."""
        import live
        self.deferred({})  # Strict, with a second model
        self.deferred({'tajweed': '0', 'letters': '1'})  # words and harakat
        E = engine()
        self.assertFalse(live.LiveSession(E, 1, 1, 1, 7, {'tajweed': '0'}, defer=True).defer)  # words only: nothing
        self.assertFalse(live.LiveSession(E, 1, 1, 1, 7, {}, follow=True, defer=True).defer)

    def deferred(self, settings):
        import threading
        import time
        import live
        E = engine()
        real = E.ayah_notes
        go, threads = threading.Event(), []

        def notes(lp, s, a, statuses, spans, st, audio=None, readings=None):
            threads.append(threading.current_thread().name)
            self.assertTrue(go.wait(30))
            return real(lp, s, a, statuses, spans, st, readings=readings)
        pcm, end = bench_pcm(), [{'type': 'end'}]
        msgs = chunks(pcm, 3200)
        session = lambda **kw: live.LiveSession(E, 1, 1, 1, 7, settings, **kw)
        with unittest.mock.patch.object(E, 'ayah_notes', notes), unittest.mock.patch.object(E, 'ear2', object(),
                                                                                             create=True):
            go.set()
            hop = run(session(), msgs + end)
            want = run(session(defer=True), msgs + end)
            self.assertEqual(run(session(defer=True), chunks(pcm, 50000) + end), want)
            go.clear()
            threads.clear()
            sess = session(defer=True)
            self.assertTrue(sess.defer)
            ev, i = [], 0
            while not sess._pending:  # up to the first ayah handed over, which then can't finish
                ev += run(sess, [msgs[i]])
                i += 1
            for _ in range(int(live.AYAH_DUE / 0.1) - 5):  # the chunks go on being answered until it is due
                ev += run(sess, [msgs[i]])
                i += 1
            self.assertTrue(sess._pending)
            for _ in range(200):  # it starts once a chunk has been answered
                if threads:
                    break
                time.sleep(0.01)
            # while reciting only the background thread judges ayat (`done` may judge again, on this one)
            self.assertTrue(threads and all(t.startswith('ayah') for t in threads), threads)
            go.set()
            ev += run(sess, msgs[i:] + end)
            self.assertEqual(ev, want)
        flow = ('at', 'said')
        self.assertEqual([e for e in want if e['type'] in flow], [e for e in hop if e['type'] in flow])
        same = lambda evs: sorted(json.dumps({k: v for k, v in e.items() if k != 't'}, sort_keys=True)
                                  for e in evs if e['type'] in ('mark', 'ayah', 'unmark'))
        self.assertEqual(same(want), same(hop))
        self.assertEqual(want[-1], hop[-1])
        late = [x['t'] - y['t'] for x, y in zip([e for e in want if e['type'] == 'ayah'],
                                                [e for e in hop if e['type'] == 'ayah'])]
        longest = max(live.AYAH_DUE, live.AYAH_DUE_SHARE['strict'] * 20)  # Al-Fatiha's ayat take under 20 s here
        self.assertTrue(late and all(0 <= d <= longest + live.LIVE['hop'] for d in late), late)

    def test_same_events_for_any_chunk_size(self):
        pcm = bench_pcm()[: 16000 * 2 * 20]
        a = run(self.session(), chunks(pcm, 3200) + [{'type': 'end'}])
        b = run(self.session(), chunks(pcm, 50000) + [{'type': 'end'}])
        self.assertEqual(a, b)

    def test_a_session_run_again_from_its_messages_gives_the_same_events(self):
        """What a resumed socket on another instance does: the phone sends the take again, with its seek and its
        dismissal where they came."""
        pcm = bench_pcm()
        log = chunks(pcm[:16000 * 2 * 12], 3200) + [{'type': 'dismiss', 'id': '4:word:lookalike'}] \
            + chunks(pcm[16000 * 2 * 12:16000 * 2 * 30], 3200) + [{'type': 'seek', 'w': 20}] \
            + chunks(pcm[16000 * 2 * 30:], 3200) + [{'type': 'end'}]
        first = run(self.session(), log)
        # again, in big chunks: the controls stay at the same place in the audio
        again, buf = [], b''
        for m in log:
            if isinstance(m, bytes):
                buf += m
                continue
            again += [buf, m]
            buf = b''
        self.assertEqual(run(self.session(), again), first)
        self.assertEqual(first[-1]['result']['score']['mistakes'],
                         sum(1 for m in first[-1]['result']['marks']
                             if m['kind'] in ('word', 'skipped', 'added') and m['id'] != '4:word:lookalike'))

    def test_an_undismiss_puts_the_mark_back_and_replays_the_same(self):
        """Undo of a "Not a mistake" (Majd, Nov 15 2026): `undismiss` at its point in the audio takes the id out of
        the dismissed set, so the score counts the mark again; run again from its messages (a resume on the other
        instance), the session sends the same events."""
        pcm = bench_pcm()
        whole = run(self.session(), chunks(pcm, 3200) + [{'type': 'end'}])
        counted = [m for m in whole[-1]['result']['marks'] if m['kind'] in ('word', 'skipped', 'added')]
        self.assertTrue(counted, 'the bench take needs a word mark for this test')
        mid = counted[0]['id']
        cut = 16000 * 2 * 12
        log = chunks(pcm, 3200) + [{'type': 'dismiss', 'id': mid}, {'type': 'undismiss', 'id': mid},
                                   {'type': 'end'}]
        undone = run(self.session(), log)
        self.assertEqual(undone[-1]['result']['score'], whole[-1]['result']['score'])
        log = chunks(pcm, 3200) + [{'type': 'dismiss', 'id': mid}, {'type': 'end'}]
        dismissed = run(self.session(), log)
        self.assertEqual(dismissed[-1]['result']['score']['mistakes'], whole[-1]['result']['score']['mistakes'] - 1)
        # mid-take, then run again in big chunks: the same events
        log = chunks(pcm[:cut], 3200) + [{'type': 'dismiss', 'id': mid}] + chunks(pcm[cut:2 * cut], 3200) \
            + [{'type': 'undismiss', 'id': mid}] + chunks(pcm[2 * cut:], 3200) + [{'type': 'end'}]
        first = run(self.session(), log)
        again, buf = [], b''
        for m in log:
            if isinstance(m, bytes):
                buf += m
                continue
            again += [buf, m]
            buf = b''
        self.assertEqual(run(self.session(), again), first)
        self.assertEqual(first[-1]['result']['score'], whole[-1]['result']['score'])


@unittest.skipUnless(MODEL.exists() and CLEAN.exists(), 'the model or the bench recitation is not here')
class StartAnywhere(unittest.TestCase):
    """Start anywhere on the page (Majd, Nov 14 2026): a take from the page (start_by) is locked to where the reciter
    began; nothing is sent before `locked`, and nothing before the start is decided."""

    def take_from(self, ayah):
        import ast
        t = json.loads(CLEAN.read_text())
        tl = ast.literal_eval(t['timeline']) if isinstance(t['timeline'], str) else t['timeline']
        E = engine()
        first = next(e for e in tl if not e.get('extra') and E.key.where(e['word'])[:2] == (1, ayah))
        with wave.open(str(CLEAN.with_suffix('.wav'))) as w:
            pcm = w.readframes(w.getnframes())
        cut = max(0, int((first['start'] - 0.3) * 16000)) * 2
        return first['word'], pcm[cut:]

    def check(self, ayah, follow=False):
        import live
        w, pcm = self.take_from(ayah)
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {}, follow=follow, start_by=(1, 7))
        ev = run(sess, chunks(pcm, 3200) + [{'type': 'end'}])
        lock = [e for e in ev if e['type'] == 'locked']
        self.assertEqual([e['w'] for e in lock], [w], ev[:6])
        self.assertEqual(ev[:ev.index(lock[0])], [])  # nothing at all before it
        done = ev[-1]['result']
        self.assertEqual((done['start'], done['from']), (w, sess.range_lo))  # from: the passage's first word (contract)
        self.assertTrue(done['words'] and min(r['w'] for r in done['words']) == w)  # nothing before it decided
        self.assertFalse([e for e in ev if e['type'] == 'mark' and e['mark']['w'] < w])
        self.assertEqual(sess.snapshot()[0]['type'], 'locked')
        return ev

    def test_a_take_from_an_ayah_mid_page_is_locked_there(self):
        self.check(5)
        self.check(5, follow=True)

    def test_a_phrase_the_page_repeats_waits_until_the_places_part(self):
        """1:3 (ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ) is also the end of 1:1: it may not lock on 1:1."""
        self.check(3)

    def test_the_page_top_locks_within_3_s(self):
        """Majd's bar (Nov 14 2026): a take from the page's first word gets its cursor within 3 s of speech."""
        import ast
        import live
        t = json.loads(CLEAN.read_text())
        tl = ast.literal_eval(t['timeline']) if isinstance(t['timeline'], str) else t['timeline']
        first = next(e for e in tl if not e.get('extra'))
        with wave.open(str(CLEAN.with_suffix('.wav'))) as w:
            pcm = w.readframes(w.getnframes())
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {}, start_by=(1, 7))
        ev = run(sess, chunks(pcm, 3200) + [{'type': 'end'}])
        lock = next(e for e in ev if e['type'] == 'locked')
        self.assertEqual(lock['w'], first['word'])
        self.assertLess(lock['t'] - first['start'], 3.0)

    def test_words_that_read_the_same_are_the_same_start(self):
        """Harakat and marks aside: 17:111's ٱلَّذِى and 18:1's ٱلَّذِىٓ sound alike, so the page's top wins the tie."""
        from live import _letters
        self.assertEqual(_letters('ٱلَّذِى'), _letters('ٱلَّذِىٓ'))
        self.assertEqual(_letters('ٱلْحَمْدُ'), 'الحمد')
        self.assertNotEqual(_letters('مَٰلِكِ'), _letters('مَلِكِ'))

    def test_a_seek_while_searching_starts_the_take_there(self):
        """The phone placed the reader by hand before the lock (a seek without startBy): the take starts at its word,
        with `locked` there; a seek with startBy searches again instead."""
        import live
        w, pcm = self.take_from(5)
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {}, start_by=(1, 7))
        ev = run(sess, [{'type': 'seek', 'w': w}] + chunks(pcm, 3200) + [{'type': 'end'}])
        lock = [e for e in ev if e['type'] == 'locked']
        self.assertEqual(([e['w'] for e in lock], ev[0]['type']), ([w], 'locked'))
        self.assertEqual(ev[-1]['result']['start'], w)
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {}, start_by=(1, 7))
        first = sess.range_lo
        ev = run(sess, [{'type': 'seek', 'w': first, 'startBy': [1, 7]}] + chunks(pcm, 3200) + [{'type': 'end'}])
        self.assertEqual([e['w'] for e in ev if e['type'] == 'locked'], [w])

    def test_nonsense_fails_silently(self):
        """Nothing found on the page: no cursor, no marks, no message (Majd), and done has no words, start null."""
        import live
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {}, start_by=(1, 7))
        ev = run(sess, chunks(noise(12), 3200) + [{'type': 'end'}])
        self.assertEqual([e['type'] for e in ev], ['done'])
        self.assertEqual((ev[-1]['result']['start'], ev[-1]['result']['words']), (None, []))

    def cut(self, name, word, page=None, seconds=20):
        """Bench take `name` from its word `word` (0.3 s before it), up to `seconds`, searched on its own page or on
        take `page`'s; the session and the timeline from that word, in seconds of the cut audio."""
        import ast
        import live
        f = BENCH / f'{name}.json'
        if not f.exists():
            self.skipTest(f'{name} is not here')
        t = json.loads(f.read_text())
        tl = ast.literal_eval(t['timeline']) if isinstance(t['timeline'], str) else t['timeline']
        words = [e for e in tl if not e.get('extra')]
        k = next(i for i, e in enumerate(words) if e['word'] == word)
        c = max(0, words[k]['start'] - 0.3)
        with wave.open(str(f.with_suffix('.wav'))) as w:
            pcm = w.readframes(w.getnframes())[int(c * 16000) * 2:][:seconds * 32000]
        pt = json.loads((BENCH / f'{page}.json').read_text()) if page else t
        sess = live.LiveSession(engine(), pt['sura'], pt['ayat'][0], pt['sura'], pt['ayat'][1], {},
                                start_by=(pt['sura'], pt['ayat'][1]))
        locks = [e for e in run(sess, chunks(pcm, 3200)) if e['type'] == 'locked']
        return locks, [dict(e, start=e['start'] - c, end=e['end'] - c) for e in words[k:]]

    def test_three_words_heard_well_lock_sooner(self):
        """QUICK_WORDS: 1:5 locks on إِيَّاكَ نَعْبُدُ وَإِيَّاكَ, while نَسْتَعِينُ is still being said (4 words
        settled, the rule before, waited for it to end)."""
        locks, words = self.cut('alafasy.p2.clean.clean', 13)
        self.assertEqual([e['w'] for e in locks], [13])
        self.assertLess(locks[0]['t'], words[3]['end'])

    def test_a_skip_right_after_the_start_still_locks(self):
        """1:5 said without نَعْبُدُ (the bench's planted skip) never locked: the run had to be heard in order
        (recite-server, Nov 15 2026). One missing word is stepped over."""
        locks, words = self.cut('alafasy.p2.m1.clean', 13)
        self.assertEqual(words[1]['word'], 15)  # 14 is the planted skip
        self.assertEqual([e['w'] for e in locks], [13])

    def test_a_look_alike_heard_poorly_does_not_lock_sooner(self):
        """Al-Kahf from 18:3 (… وَيُنذِرَ … مَّا لَهُم بِهِۦ … لِءَابَآئِهِمْ) searched on Ya-Sin 36:1–18: ما أنذر آباؤهم
        (36:6) is heard as 3 correct words, but poorly (-1.7 and -2.0 on average), so QUICK_WORDS doesn't take it."""
        import live
        locks, _ = self.cut('sudais.p3.clean.clean', 37569, page='sudais.p4.clean.clean')
        self.assertEqual(locks, [])
        self.assertTrue(live.LiveSession._heard_well({'scores': [-0.2, -0.9, 0.0]}))
        self.assertFalse(live.LiveSession._heard_well({'scores': [-0.4, -2.6]}))
        self.assertFalse(live.LiveSession._heard_well({'scores': []}))

    def test_without_start_by_nothing_changes(self):
        import live
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {})
        ev = run(sess, chunks(bench_pcm()[:16000 * 2 * 10], 3200) + [{'type': 'end'}])
        self.assertFalse([e for e in ev if e['type'] in ('locked', 'nolock')])
        self.assertNotIn('start', ev[-1]['result'])


class Background(unittest.TestCase):
    def test_an_ayah_is_judged_only_once_the_chunk_is_answered(self):
        import threading
        import live
        idle, ran = threading.Event(), threading.Event()
        fut = live._ayah_submit(idle, lambda x: ran.set() or x * 2, 21)
        self.assertFalse(ran.wait(0.2))  # the session is still working on its chunk
        idle.set()
        got, ms = fut.result(5)
        self.assertEqual((got, ran.is_set()), (42, True))
        self.assertGreaterEqual(ms, 0)

    def test_an_ayah_said_again_is_judged_on_its_last_readings(self):
        """Going back to restart is no mistake (Majd, Nov 14 2026): the ayah's frames follow each word's last reading,
        the first go and its pause cut out; with nothing said again, the frames are what they always were."""
        from engine import CUT_MARGIN, PAD, ayah_pieces
        ws = [10, 11, 12, 13, 14]
        once = {10: (100, 120), 11: (120, 140), 12: (140, 160), 13: (160, 180), 14: (180, 200)}
        self.assertEqual(ayah_pieces(ws, once, None, 10 ** 6), [(100 - PAD, 200 + PAD)])
        self.assertEqual(ayah_pieces(ws, once, once, 10 ** 6), [(100 - PAD, 200 + PAD)])
        # 10..13, a pause, back to 12, then 12..14
        spans = {10: (100, 120), 11: (120, 140), 12: (140, 220), 13: (160, 240), 14: (240, 260)}
        last = {10: (100, 120), 11: (120, 140), 12: (200, 220), 13: (220, 240), 14: (240, 260)}
        self.assertEqual(ayah_pieces(ws, spans, last, 10 ** 6),
                         [(100 - PAD, 140 + CUT_MARGIN), (200 - CUT_MARGIN, 260 + PAD)])
        # back to the ayah's start: only the last go counts
        spans = {10: (100, 220), 11: (120, 240), 12: (140, 260), 13: (160, 280), 14: (280, 300)}
        last = {10: (200, 220), 11: (220, 240), 12: (240, 260), 13: (260, 280), 14: (280, 300)}
        self.assertEqual(ayah_pieces(ws, spans, last, 10 ** 6), [(200 - PAD, 300 + PAD)])
        self.assertEqual(ayah_pieces(ws, spans, last, 290), [(200 - PAD, 290)])  # clipped to the frames there are


class Score(unittest.TestCase):
    def test_an_unsure_harakat_or_letter_mark_is_not_clear_and_not_a_mistake(self):
        """Majd, Nov 15 2026 ("Not clear: say it more clearly"): unsure harakat and letter marks are counted apart, out
        of accuracy; unsure word marks stay mistakes (recite-contract.md, The score)."""
        from engine import score
        statuses = {w: 'correct' for w in range(100, 120)}
        marks = [{'id': 'a', 'w': 101, 'kind': 'harakat', 'sure': 'clear'},
                 {'id': 'b', 'w': 102, 'kind': 'harakat', 'sure': 'likely'},
                 {'id': 'c', 'w': 103, 'kind': 'letter', 'sure': 'likely'},
                 {'id': 'd', 'w': 104, 'kind': 'word', 'sure': 'likely'},
                 {'id': 'e', 'w': 105, 'kind': 'tajweed', 'sure': 'likely'},
                 {'id': 'f', 'w': 106, 'kind': 'letter', 'sure': 'likely'}]
        self.assertEqual(score(statuses, marks, dismissed={'f'}),
                         {'reached': 20, 'mistakes': 2, 'tajweed': 1, 'unclear': 2, 'accuracy': 0.9})


@unittest.skipUnless(MODEL.exists() and ITEM.exists(), 'the model or the bench is not here')
class SimilarPassage(unittest.TestCase):
    """A slip into a similar passage is named (`into` on the run's first mark: recite-contract.md), in a check and at
    a live take's end, from bench-v0's planted slips (the ayah starts right, then carries on as a similar one)."""

    def setUp(self):
        if engine().table is None:
            self.skipTest('no word table for these words: nothing is named without it')

    def named(self, name, s, a, s2, a2, where=BENCH):
        """{(w, kind): into} of the marks with `into`: (from a check, from a live take)."""
        import live
        if not (where / f'{name}.wav').exists():
            self.skipTest(f'{name} is not here')
        with wave.open(str(where / f'{name}.wav')) as f:
            pcm = f.readframes(f.getnframes())
        x = np.frombuffer(pcm, '<i2').astype(np.float32) / 32768
        checked = engine().check(x, s, a, s2, a2, v=2)
        ev = run(live.LiveSession(engine(), s, a, s2, a2, {}), chunks(pcm, 3200) + [{'type': 'end'}])
        return [{(m['w'], m['kind']): m['into'] for m in r['marks'] if 'into' in m}
                for r in (checked, ev[-1]['result'])]

    def test_a_slip_into_a_similar_ayah_names_it(self):
        """2:255 said «ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ» and then 20:8's «لَهُ ٱلْأَسْمَآءُ ٱلْحُسْنَىٰ»: the skipped «ٱلْحَىُّ» carries where
        the reciter went, 20:8 from its sixth word."""
        first = engine().words.first_word(20, 8) + 5
        for got in self.named('alafasy.p8.m1.clean', 2, 255, 2, 257):
            self.assertEqual(got, {(5178, 'skipped'): {'w': first, 'ayah': [20, 8]}})

    def test_ayat_with_the_same_words_come_along(self):
        """2:8 into 22:8 («يُجَـٰدِلُ فِى ٱللَّهِ بِغَيْرِ عِلْمٍۢ…»), which 31:20 also says."""
        checked, at_end = self.named('husary.p1.m1.clean', 2, 6, 2, 16)
        for got in (checked, at_end):
            self.assertEqual([(v['ayah'], v.get('also')) for v in got.values() if not v.get('ending')],
                             [([22, 8], [[31, 20]])])
            # the take's planted substitution put «بِمُؤْمِنِينَ» for 2:15's last word: that is 2:8's ending, so naming
            # it is right (at the live take's end, where the word before was heard right)
            self.assertIn({w: v['ayah'] for (w, _), v in got.items() if v.get('ending')}, ({}, {180: [2, 8]}))

    def test_an_ayah_ending_said_as_a_nearby_one_names_it(self):
        """1:4 ended with «ٱلرَّحِيمِ» (1:3's ending, and 1:1's) for «ٱلدِّينِ»: its mark says so, `ending: true`. The take's
        other two swapped endings aren't named at the end of either: nothing is named on weak evidence."""
        for got in self.named('shuraym.p2.end.clean', 1, 1, 1, 7, where=ENDINGS):
            self.assertEqual(got, {(12, 'word'): {'w': 9, 'ayah': [1, 3], 'also': [[1, 1]], 'ending': True}})

    def test_naming_starts_nothing_once_its_work_is_spent(self):
        """A take full of mistakes can't hold up the answer: once similar.P['budget'] is spent no run or ending is
        tried. The budget is work, not time, so the same take names the same on the Mac and on Cloud Run."""
        import similar
        with wave.open(str(BENCH / 'alafasy.p8.m1.clean.wav')) as f:
            x = np.frombuffer(f.readframes(f.getnframes()), '<i2').astype(np.float32) / 32768
        with unittest.mock.patch.dict(similar.P, {'budget': 0}):
            got = engine().check(x, 2, 255, 2, 257, v=2)
        self.assertFalse([m for m in got['marks'] if 'into' in m])
        self.assertTrue([m for m in got['marks'] if m['kind'] == 'skipped'])  # the marks themselves are all there

    def test_no_name_without_a_slip(self):
        """Al-Fatiha with a word said as another and one skipped, and as recited: nothing named."""
        for name in ('alafasy.p2.m1.clean', 'alafasy.p2.clean.clean'):
            self.assertEqual(self.named(name, 1, 1, 1, 7), [{}, {}])



@unittest.skipUnless(MODEL.exists() and ITEM.exists() and CLEAN.exists(),
                     'the model or the bench recitations are not here (the image has the model, not the bench)')
class OffHere(unittest.TestCase):
    """`off`: something else said in the next word's slot, for the hidden view (2026-11-15 idea, approved)."""

    def events(self, item):
        import live
        with wave.open(str(item.with_suffix('.wav'))) as f:
            pcm = f.readframes(f.getnframes())
        return run(live.LiveSession(engine(), 1, 1, 1, 7, {}, follow=True), chunks(pcm, 3200) + [{'type': 'end'}])

    def test_a_word_said_as_another_is_off_before_it_is_decided(self):
        """Al-Fatiha with word 4 said as another word: `off` for 4, while the word in its place is still being said,
        before `said` passes it."""
        ev = self.events(ITEM)
        off = [e for e in ev if e['type'] == 'off']
        self.assertEqual([e['w'] for e in off][:1], [4])
        passed = next(e['t'] for e in ev if e['type'] == 'said' and e['upTo'] >= 4)
        self.assertLess(off[0]['t'], passed)

    def test_nothing_is_off_in_a_correct_take(self):
        self.assertEqual([e for e in self.events(CLEAN) if e['type'] == 'off'], [])


@unittest.skipUnless(MODEL.exists() and CLEAN.exists(),
                     'the model or the bench recitations are not here (the image has the model, not the bench)')
class QuranStart(unittest.TestCase):
    """Anywhere in the Qur'an (recite-anywhere step 2, protocol 7, `startIn: "quran"`): a take whose start isn't on the
    reader's page is found Qur'an-wide, and locked only once its place is unique; a wrong jump is worse than none."""

    def setUp(self):
        if engine().table is None:
            self.skipTest('no word table: the Qur\'an-wide search needs it')

    def cut(self, name, w, secs=30):
        """The take `name` of bench-v0 from app word w on, as PCM bytes."""
        t = json.loads((BENCH / f'{name}.json').read_text())
        x = next(e for e in t['timeline'] if e.get('word') == w and not e.get('extra'))
        with wave.open(str(BENCH / f'{name}.wav')) as f:
            pcm = f.readframes(f.getnframes())
        i = int(x['start'] * 16000) * 2
        return pcm[i:i + secs * 32000]

    def lock(self, pcm, s, a, sb, start_in='quran'):
        import live
        sess = live.LiveSession(engine(), s, a, 114, 6, {'letters': '0', 'tajweed': '0'}, open_end=True, start_by=sb,
                                start_in=start_in)
        ev = run(sess, chunks(pcm, 16000) + [{'type': 'end'}])
        return [{k: e.get(k) for k in ('w', 's', 'a', 'where')} for e in ev if e['type'] == 'locked'], ev

    def test_a_start_off_the_page_is_found_when_it_parts_from_the_page(self):
        """An-Naba' 78:29 «وَكُلَّ شَىْءٍ أَحْصَيْنَـٰهُ كِتَـٰبًۭا» with Ya-Sin's first page open: 36:12 there also says
        «وَكُلَّ شَىْءٍ أَحْصَيْنَـٰهُ». The page doesn't lock while 78:29 fits clearly better (QURAN_DOUBT), and the take
        locks to 78:29 once its words are its own."""
        w = engine().words.first_word(78, 29)
        if not (BENCH / 'husary.p7.clean.clean.wav').exists():
            self.skipTest('bench-v0 is not here')
        locks, ev = self.lock(self.cut('husary.p7.clean.clean', w), 36, 1, (36, 11))
        self.assertEqual(locks, [{'w': w, 's': 78, 'a': 29, 'where': 'quran'}])
        self.assertEqual(ev[-1]['result']['start'], w)

    def test_audio_that_is_not_the_quran_never_locks(self):
        """The same take reversed (speech-like, not the Qur'an) and noise: no lock, so the take fails silently."""
        if not (BENCH / 'husary.p7.clean.clean.wav').exists():
            self.skipTest('bench-v0 is not here')
        pcm = self.cut('husary.p7.clean.clean', engine().words.first_word(78, 29))
        rev = np.frombuffer(pcm, '<i2')[::-1].astype('<i2').tobytes()
        for x in (rev, noise(20, seed=5)):
            self.assertEqual(self.lock(x, 36, 1, (36, 11))[0], [])

    def test_a_start_on_the_page_locks_as_without_it(self):
        """Al-Fatiha from 1:5 with Al-Fatiha open: the same lock with startIn as without, `where` "page"."""
        w = engine().words.first_word(1, 5)
        pcm = self.cut('alafasy.p2.clean.clean', w)
        with_q, _ = self.lock(pcm, 1, 1, (1, 7))
        without, _ = self.lock(pcm, 1, 1, (1, 7), start_in=None)
        self.assertEqual(with_q, [{'w': w, 's': 1, 'a': 5, 'where': 'page'}])
        self.assertEqual(without, [{'w': w, 's': 1, 'a': 5, 'where': None}])

    def test_a_doubt_from_off_the_page_lets_go_when_that_place_is_heard_wrong(self):
        """An-Naba' 78:25 «إِلَّا حَمِيمًۭا وَغَسَّاقًۭا» with its own page open: Sad 38:57 («حَمِيمٌۭ وَغَسَّاقٌۭ») fits
        better at first and holds the page's lock back, until its own locator hears a word wrong; then the page
        locks. (With the doubt held for good, this take never locked.)"""
        if not (BENCH / 'alafasy.p7.clean.clean.wav').exists():
            self.skipTest('bench-v0 is not here')
        w = engine().words.first_word(78, 25)
        locks, _ = self.lock(self.cut('alafasy.p7.clean.clean', w), 78, 1, (78, 30))
        self.assertEqual(locks, [{'w': w, 's': 78, 'a': 25, 'where': 'page'}])


# the lab's bench_slips.py: bench-v0's passages with hesitations, pauses and corrections planted (none a mistake)
SLIPS = pathlib.Path(os.environ.get('RECITE_BENCH_SLIPS',
                                    pathlib.Path.home() / 'revisely-mistake-lab/data/bench-slips/items'))


@unittest.skipUnless((SLIPS / 'alafasy.p2.slips.clean.wav').exists(), "the lab's planted-slips bench is not here")
class Corrections(unittest.TestCase):
    def test_a_word_tried_dropped_and_said_again_is_not_marked(self):
        """Al-Fatiha with «نَعْبُدُ» said in place of «ٱلْمَغْضُوبِ» (25), a pause, then back to «أَنْعَمْتَ» (22) and on, right.
        Before the decoder could go back from a filler, it took the first «أَنْعَمْتَ عَلَيْهِمْ غَيْرِ» and the dropped
        word in as one extra word after «ٱلَّذِينَ» (21); a correction is not a mistake (recite-contract.md). The
        hesitations and the pause planted in the same take aren't marked either."""
        import live
        with wave.open(str(SLIPS / 'alafasy.p2.slips.clean.wav')) as f:
            pcm = f.readframes(f.getnframes())
        x = np.frombuffer(pcm, '<i2').astype(np.float32) / 32768
        checked = engine().check(x, 1, 1, 1, 7, v=2)
        ev = run(live.LiveSession(engine(), 1, 1, 1, 7, {}), chunks(pcm, 3200) + [{'type': 'end'}])
        for res in (checked, ev[-1]['result']):
            self.assertEqual([(m['w'], m['kind']) for m in res['marks'] if m['kind'] != 'tajweed'], [])
        self.assertEqual([e['mark']['w'] for e in ev if e['type'] == 'mark' and e['mark']['kind'] != 'tajweed'], [])


class LookAlikes(unittest.TestCase):
    def test_a_spelling_apart_only_in_shadda_or_madd_is_not_a_lookalike(self):
        """يَـٰبَنِىَّ (baniyya, 12:87) and يَـٰبَنِىٓ (banī) are written alike; only the shadda and the madd differ, which is
        the letters check's business. As a look-alike it marked Majd's correct start of page 246 (Nov 15 2026)."""
        import unicodedata
        nfc = lambda t: unicodedata.normalize('NFC', t)  # noqa: E731 (shadda and fatha come in either order)
        kws = engine().passage_words(31413, 31415)
        self.assertEqual(nfc(kws[0]['text']), nfc('يَـٰبَنِىَّ'))
        self.assertNotIn(nfc('يَـٰبَنِىٓ'), [nfc(a['text']) for a in kws[0]['alts']])

    def test_a_glide_into_a_hamza_is_not_a_lookalike(self):
        """«قَالُوٓا۟ أَءِنَّكَ» (12:90) joined sounds as «qālū waʾinnaka»: the long ū glides into the hamza. وَإِنَّكَ is
        that glide and the rest of the word, so it isn't a look-alike there (Majd's mic-on take, Nov 15 2026); the
        word's other look-alikes stay."""
        import unicodedata
        nfc = lambda t: unicodedata.normalize('NFC', t)  # noqa: E731
        kws = engine().passage_words(31464, 31466)
        alts = [nfc(a['text']) for a in kws[1]['alts']]
        self.assertNotIn(nfc('وَإِنَّكَ'), alts)
        self.assertIn(nfc('فَإِنَّكَ'), alts)


DEV_TAKE = sorted(pathlib.Path(os.environ.get('RECITE_DEV_TAKES', pathlib.Path.home() / 'revisely-mistake-lab/data/dev-takes'))
                  .glob('*/20261115-015943-4cd655.wav'))


@unittest.skipUnless(DEV_TAKE, "Majd's kept Dev take (test data on the lab's Mac only, never in git)")
class DevTake(unittest.TestCase):
    def test_page_246_from_the_top_marks_only_the_slip(self):
        """Majd's Recite take of page 246 (12:87 on), live at Words & harakat. Its first words, يَـٰبَنِىَّ ٱذْهَبُوا۟, are
        right and were marked as look-alikes (يَـٰبَنِىٓ, then يَذْهَبُوا۟ taking the ya). The one mark is the second
        رَّوْحِ, heard رُوح (the ear: a long ū for 7 frames, no fatha). Up to his Stop at 42 s; the rest is the app's
        recitation playing back into the microphone."""
        import live
        with wave.open(str(DEV_TAKE[0])) as w:
            pcm = w.readframes(16000 * 42)
        sess = live.LiveSession(engine(), 12, 87, None, None, {'letters': '1', 'tajweed': '0'}, defer=True,
                                open_end=True)
        ev = run(sess, chunks(pcm, 3200) + [{'type': 'end'}])
        live_marks = [(e['mark']['w'], e['mark']['kind']) for e in ev if e['type'] == 'mark']
        self.assertEqual(live_marks, [(31428, 'harakat')])
        self.assertEqual([(m['w'], m['kind'], m['sure']) for m in ev[-1]['result']['marks']],
                         [(31428, 'harakat', 'clear')])


if __name__ == '__main__':
    unittest.main()
