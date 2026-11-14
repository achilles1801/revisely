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

    def test_refuses_a_passage_that_does_not_exist(self):
        import live
        from engine import BadRequest
        with self.assertRaises(BadRequest):
            live.LiveSession(engine(), 1, 8, None, None, {})
        with self.assertRaises(BadRequest):
            live.LiveSession(engine(), 2, 5, 2, 1, {})


@unittest.skipUnless(MODEL.exists() and ITEM.exists(), 'the model or the bench recitation is not here')
class Bench(unittest.TestCase):
    def session(self):
        import live
        return live.LiveSession(engine(), 1, 1, 1, 7, {})

    def test_planted_mistakes_are_marked_live_and_at_the_end(self):
        ev = run(self.session(), chunks(bench_pcm(), 3200) + [{'type': 'end'}])
        live_marks = {e['mark']['w']: e['mark'] for e in ev if e['type'] == 'mark'}
        self.assertEqual(live_marks[14]['kind'], 'skipped')
        self.assertEqual(live_marks[4]['kind'], 'word')
        self.assertIn(live_marks[4]['detail'], ('lookalike', 'replaced', 'sound'))
        end = ev[-1]['result']
        self.assertEqual({(m['w'], m['kind']) for m in end['marks'] if m['kind'] != 'tajweed'},
                         {(4, 'word'), (14, 'skipped')})
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
        import live
        sess = live.LiveSession(engine(), 1, 1, 1, 7, {'letters': '1'}, follow=True)
        ev = run(sess, chunks(bench_pcm(), 3200) + [{'type': 'end'}])
        self.assertEqual({e['type'] for e in ev} - {'at', 'said', 'ayah', 'done'}, set())
        res = ev[-1]['result']
        self.assertNotIn('marks', res)
        self.assertNotIn('score', res)
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

        def notes(lp, s, a, statuses, spans, st, audio=None):
            seen.append(None if audio is None else len(audio))
            return real(lp, s, a, statuses, spans, st)
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


if __name__ == '__main__':
    unittest.main()
