"""The service's protocol, with the checker stood in (no model needed): sign-in and testers on every request and
socket, /check v1 and v2, /dismiss, and /live (start, events, stop, idle, resume, limits, keeping a take); production's
switches (testers, App Check, paused, nothing kept).

  python -m unittest discover -s tests      (from the staged folder, or the image: the Dockerfile runs it)
"""
import io
import json
import logging
import os
import sys
import threading
import time
import traceback
import unittest
import wave
from unittest import mock

import google.auth.crypt
import google.auth.jwt
import requests
import rsa

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.environ['LIVE_HELPER'] = '0'
logging.disable(logging.INFO)

from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

import auth  # noqa: E402
import health  # noqa: E402
import live  # noqa: E402
import server  # noqa: E402
import store  # noqa: E402

SR = 16000


def wav(seconds=2.0):
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b'\0\0' * int(seconds * SR))
    return buf.getvalue()


class FakeEngine:
    def __init__(self, threads=2):
        self.calls = []
        self.table = None

    def passage(self, s, a, s2=None, a2=None, max_words=None):
        """Ten words an ayah, numbered as sura * 3000 + ayah * 10; an ayah past 286 doesn't exist."""
        if a > 286 or (a2 or 1) > 286:
            raise server.BadRequest(f'no ayah {s2}:{a2}')
        lo, hi = s * 3000 + a * 10, (s2 or s) * 3000 + (a2 or a) * 10 + 10
        if hi <= lo:
            raise server.BadRequest('the passage ends before it starts')
        return lo, hi

    def ears(self):
        return {'recite': 'v6', 'harakat': 'v6', 'strict': 'released+v5'}

    def check(self, x, s, a, s2, a2, q, v=1):
        self.calls.append((v, s, a, s2, a2))
        res = {'v': 1, 'secs': round(len(x) / SR, 1), 'words': [], 'extras': [], 'tajweed': [], 'letters': None,
               'ms': {}}
        if v == 2:
            res.update(v=2, marks=[], score={'reached': 0, 'mistakes': 0, 'tajweed': 0, 'accuracy': 1.0})
        return res


class FakeSession:
    """Stands in for live.LiveSession: an `at` event every second of audio, a mark at 1 s, `done` on end."""

    made = []

    def __init__(self, engine, s, a, s2, a2, settings, follow=False, defer=False, open_end=False, **kw):
        self.args = (s, a, s2, a2, settings)
        self.kw = kw  # start_by (protocol 6) only when the phone sent startBy
        self.controls = []
        self.follow, self.defer, self.open_end = follow, defer, open_end
        self.hints = []
        self.n = 0
        self.stopped = False
        self.result = None
        self.dismissed = set()
        self.pcm = __import__('numpy').zeros(SR * 60, 'int16')
        FakeSession.made.append(self)

    @property
    def seconds(self):
        return self.n / SR

    def feed(self, data):
        before = self.n // SR
        self.pcm[self.n:self.n + len(data) // 2] = 1
        self.n += len(data) // 2
        ev = []
        for sec in range(before + 1, self.n // SR + 1):
            ev.append({'type': 'at', 'w': 100 + sec, 't': float(sec)})
            if sec == 1:
                ev.append({'type': 'mark', 'mark': {'id': '101:skipped:', 'w': 101, 'kind': 'skipped',
                                                    'ayah': [1, 1], 'sure': 'likely'}, 't': 1.0})
        return ev

    def snapshot(self):
        return [{'type': 'at', 'w': 100 + self.n // SR, 't': float(self.n // SR)}] if self.n else []

    def control(self, msg):
        self.controls.append(msg)
        if msg['type'] == 'dismiss':
            self.dismissed.add(msg['id'])
            return []
        if msg['type'] == 'undismiss':
            self.dismissed.discard(msg['id'])
            return []
        if msg['type'] == 'hint':
            self.hints.append(msg)
            return []
        if msg['type'] in ('end', 'stop'):
            self.stopped = True
            self.result = {'v': 2, 'marks': [], 'score': {'reached': 0, 'mistakes': 0, 'tajweed': 0,
                                                          'accuracy': None},
                           'secs': round(self.seconds, 1), 'why': 'end'}
            if self.follow:  # Recite's answer: words only, no marks or score
                self.result = {'v': 2, 'follow': True, 'words': [], 'marks': [], 'score': None,
                               'secs': round(self.seconds, 1), 'why': 'end'}
            return [{'type': 'done', 'result': self.result}]
        return []


def uid_of(header):
    tokens = {'Bearer good': 'tester1', 'Bearer other': 'tester2', 'Bearer plain': 'plain1'}
    if header not in tokens:
        raise auth.Refused(401, 'sign_in')
    return tokens[header]


class Base(unittest.TestCase):
    def put(self, name, data, ct):  # create-only, as Storage is (ifGenerationMatch=0)
        if name in self.stored:
            raise store.Exists()
        self.stored[name] = data

    def setUp(self):
        self.stored = {}
        self.health = []  # (kind, fields) of every health line (health.py)
        FakeSession.made = []
        health.STATE['takes'] = 0
        patches = [
            mock.patch.object(health, 'emit',  # as emit prints it: a None field left out
                              lambda line, /, **f: self.health.append((line, {k: v for k, v in f.items()
                                                                              if v is not None}))),
            mock.patch.object(server, 'Engine', FakeEngine),
            mock.patch.object(auth, 'uid_of', uid_of),
            mock.patch.object(auth, 'is_tester', lambda uid: uid.startswith('tester')),
            mock.patch.object(auth, 'has_check', lambda uid: uid == 'tester1'),
            mock.patch.object(store, 'put', self.put),
            mock.patch.object(store, 'BUCKET', 'test-bucket'),  # dev's services name one; production names none
            mock.patch.object(live, 'LiveSession', FakeSession),
            mock.patch.object(server, 'limiter', auth.Limiter()),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        server.SESSIONS.clear()
        server.FINISHED.clear()
        self.client = TestClient(server.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)


class CheckTests(Base):
    def test_health(self):
        r = self.client.get('/health')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body['ok'], body['protocol']), (True, 7))
        self.assertIn('server', body)
        self.assertIn('engine', body)
        self.assertIs(body['words'], False)  # FakeEngine has no word table

    def test_health_says_which_model_each_level_runs(self):
        self.assertEqual(self.client.get('/health').json()['ears'],
                         {'recite': 'v6', 'harakat': 'v6', 'strict': 'released+v5'})
        with mock.patch.object(FakeEngine, 'ears', None):  # an engine from before levels had their own models
            self.assertNotIn('ears', self.client.get('/health').json())

    def test_health_says_when_the_word_table_is_there(self):
        server.ENGINE['e'].table = {'offsets': [], 'blob': b''}
        self.assertIs(self.client.get('/health').json()['words'], True)

    def test_sign_in_and_testers_only(self):
        r = self.client.post('/check?s=1&a=1', content=wav())
        self.assertEqual((r.status_code, r.json()), (401, {'error': 'sign_in'}))
        r = self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer plain'})
        self.assertEqual((r.status_code, r.json()), (403, {'error': 'testers_only'}))

    def test_v1_stays_v1(self):
        r = self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer good'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['v'], 1)
        self.assertNotIn('take', r.json())

    def test_v2_and_keep(self):
        r = self.client.post('/check?s=1&a=1&s2=1&a2=7&v=2&keep=1', content=wav(),
                             headers={'Authorization': 'Bearer good'})
        body = r.json()
        self.assertEqual((r.status_code, body['v'], body['kept']), (200, 2, True))
        self.assertTrue(store.TAKE.match(body['take']))
        base = f"recite-tests/tester1/{body['take']}"
        self.assertEqual(sorted(self.stored), [base + '.json', base + '.wav'])
        self.assertEqual(json.loads(self.stored[base + '.json'])['request']['a2'], '7')

    def test_bad_requests(self):
        h = {'Authorization': 'Bearer good'}
        self.assertEqual(self.client.post('/check?s=1', content=wav(), headers=h).status_code, 400)
        self.assertEqual(self.client.post('/check?s=1&a=1&s2=2', content=wav(), headers=h).status_code, 400)
        self.assertEqual(self.client.post('/check?s=1&a=1', content=b'nope', headers=h).status_code, 400)

    def test_hourly_limit(self):
        h = {'Authorization': 'Bearer good'}
        codes = [self.client.post('/check?s=1&a=1', content=wav(0.1), headers=h).status_code for _ in range(41)]
        self.assertEqual(codes[:40], [200] * 40)
        self.assertEqual(codes[40], 429)


class DismissTests(Base):
    def test_dismiss(self):
        h = {'Authorization': 'Bearer good'}
        r = self.client.post('/dismiss', json={'take': '20261113-101010-abcdef', 'id': '12:word:skipped'}, headers=h)
        self.assertEqual(r.json(), {'ok': True})
        [(name, data)] = self.stored.items()
        self.assertTrue(name.startswith('recite-tests/tester1/20261113-101010-abcdef.dismiss-'))
        self.assertEqual(json.loads(data)['id'], '12:word:skipped')

    def test_dismiss_refuses(self):
        for route in ('/dismiss', '/undismiss'):
            r = self.client.post(route, json={'take': '20261113-101010-abcdef', 'id': '12:word:skipped'})
            self.assertEqual(r.status_code, 401)
            h = {'Authorization': 'Bearer good'}
            for body in ({'take': '../other/x', 'id': '12:word:skipped'}, {'take': '20261113-101010-abcdef', 'id': 'x'},
                         {'take': '20261113-101010-abcdef'}, ['20261113-101010-abcdef'],
                         {'take': '20261113-101010-abcdef', 'id': '12:wrong:x'}):
                self.assertEqual(self.client.post(route, json=body, headers=h).status_code, 400, (route, body))
        self.assertEqual(self.stored, {})

    def test_every_kind_of_mark_can_be_dismissed(self):
        """The ids engine.marks makes: before Nov 15 2026 /dismiss refused skipped, added and harakat marks."""
        h = {'Authorization': 'Bearer good'}
        for mid in ('12:skipped:', '12:added:', '12:added:trail', '12:added:#2', '12:word:lookalike',
                    '12:harakat:', '12:harakat:shadda', '12:letter:', '12:letter:#3', '12:tajweed:madd_munfasil'):
            r = self.client.post('/dismiss', json={'take': '20261113-101010-abcdef', 'id': mid}, headers=h)
            self.assertEqual(r.status_code, 200, mid)
        self.assertEqual(len(self.stored), 10)

    def test_undismiss(self):
        """Undo of a "Not a mistake" after the fact: its own file, with the phone's time of the tap when it sent one,
        so the lab can take the latest of the two (fetch_takes.dismissed_now)."""
        h = {'Authorization': 'Bearer good'}
        r = self.client.post('/undismiss', json={'take': '20261113-101010-abcdef', 'id': '12:skipped:',
                                                 'when': 1763180000123}, headers=h)
        self.assertEqual(r.json(), {'ok': True})
        [(name, data)] = self.stored.items()
        self.assertTrue(name.startswith('recite-tests/tester1/20261113-101010-abcdef.undismiss-'))
        kept = json.loads(data)
        self.assertEqual((kept['id'], kept['when'], kept['undo']), ('12:skipped:', 1763180000123, True))
        self.assertIsInstance(kept['at'], float)
        # a `when` that isn't a time in ms is left out, not refused
        self.client.post('/undismiss', json={'take': '20261113-101010-abcdef', 'id': '12:skipped:', 'when': 'soon'},
                         headers=h)
        self.assertEqual(sum('when' in json.loads(d) for d in self.stored.values()), 1)


def start(token='good', **kw):
    return json.dumps({'type': 'start', 'token': token, 's': 1, 'a': 1, 's2': None, 'a2': None,
                       'mon': 4, 'mot': 4, 'aar': 0, 'letters': False, 'keep': False, **kw})


def second_of_audio():
    return b'\1\0' * SR


class LiveTests(Base):
    def socket(self):
        return self.client.websocket_connect('/live')

    def test_refuses_without_a_start_frame(self):
        with self.socket() as ws:
            ws.send_bytes(b'\0\0')
            self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'bad_request'})

    def test_refuses_bad_tokens_and_non_testers(self):
        for token, reason in (('bad', 'sign_in'), ('plain', 'testers_only')):
            with self.socket() as ws:
                ws.send_text(start(token))
                self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': reason})
        self.assertEqual(FakeSession.made, [])

    def test_token_in_the_header(self):
        with self.client.websocket_connect('/live', headers={'Authorization': 'Bearer good'}) as ws:
            ws.send_text(json.dumps({'type': 'start', 's': 1, 'a': 1}))
            self.assertEqual(ws.receive_json()['type'], 'ready')
        with self.socket() as ws:
            ws.send_text(json.dumps({'type': 'start', 's': 1, 'a': 1}))
            self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'sign_in'})

    def test_refuses_a_bad_passage(self):
        with self.socket() as ws:
            ws.send_text(json.dumps({'type': 'start', 'token': 'good', 's': 1}))
            self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'bad_request'})

    def test_a_session(self):
        with self.socket() as ws:
            ws.send_text(start(keep=True, mon=5, aar=2, letters=True))
            ready = ws.receive_json()
            self.assertEqual((ready['type'], ready['from'], ready['v'], ready['protocol']), ('ready', 0, 2, 7))
            self.assertTrue(store.TAKE.match(ready['take']))
            self.assertEqual(FakeSession.made[0].args, (1, 1, 114, 6, {'mon': 5, 'mot': 4, 'aar': 2,
                                                                       'letters': '1', 'tajweed': '1'}))
            self.assertFalse(FakeSession.made[0].follow)
            self.assertTrue(FakeSession.made[0].defer)  # each ayah judged off the hop: never holds up the cursor
            for _ in range(10):
                ws.send_bytes(b'\1\0' * 1600)  # 100 ms chunks, as micSource sends them
            self.assertEqual(ws.receive_json()['type'], 'at')
            self.assertEqual(ws.receive_json()['mark']['id'], '101:skipped:')
            ws.send_text(json.dumps({'type': 'dismiss', 'id': '101:skipped:'}))
            ws.send_text(json.dumps({'type': 'end'}))
            done = ws.receive_json()
            self.assertEqual((done['type'], done['result']['secs']), ('done', 1.0))
            self.assertEqual(done['result']['take'], ready['take'])
            self.assertNotIn('kept', done['result'])  # `done` goes before the upload; `kept` follows it
            self.assertEqual(ws.receive_json(), {'type': 'kept', 'take': ready['take'], 'ok': True, 't': 1.0})
            with self.assertRaises(WebSocketDisconnect):
                ws.receive_json()
        base = f"recite-tests/tester1/{ready['take']}"
        self.assertEqual(sorted(self.stored), [base + '.json', base + '.wav'])
        kept = json.loads(self.stored[base + '.json'])
        self.assertEqual([e['type'] for e in kept['events']], ['at', 'mark'])
        self.assertEqual(kept['result']['why'], 'end')
        self.assertEqual(kept['dismissed'], ['101:skipped:'])
        self.assertEqual(kept['mode'], 'live')
        self.assertNotIn(ready['take'], server.SESSIONS)

    def test_an_undone_dismissal_is_left_out_of_the_kept_take(self):
        """Undo on the card while the take is live: `undismiss` goes to the session at its point in the audio, as
        `dismiss` does, so the score counts the mark again and the kept take's `dismissed` leaves it out."""
        with self.socket() as ws:
            ws.send_text(start(keep=True))
            ready = ws.receive_json()
            ws.send_bytes(second_of_audio())
            self.assertEqual(ws.receive_json()['type'], 'at')
            self.assertEqual(ws.receive_json()['type'], 'mark')
            for frame in ({'type': 'dismiss', 'id': '101:skipped:'}, {'type': 'dismiss', 'id': '102:word:sound'},
                          {'type': 'undismiss', 'id': '101:skipped:'}, {'type': 'end'}):
                ws.send_text(json.dumps(frame))
            self.assertEqual(ws.receive_json()['type'], 'done')
            self.assertEqual(ws.receive_json()['type'], 'kept')
        self.assertEqual([c['type'] for c in FakeSession.made[0].controls],
                         ['dismiss', 'dismiss', 'undismiss', 'end'])
        kept = json.loads(self.stored[f"recite-tests/tester1/{ready['take']}.json"])
        self.assertEqual(kept['dismissed'], ['102:word:sound'])

    def test_a_take_with_no_end_follows_to_the_end_of_the_quran(self):
        """No s2/a2 (as the app sends it): the session runs to 114:6, so the follow carries on into the next surah;
        the kept request says what was asked. An end the phone gives is kept as given."""
        with self.socket() as ws:
            ws.send_text(start(s=78, a=1, keep=True))
            ready = ws.receive_json()
            ws.send_bytes(second_of_audio())
            ws.send_text(json.dumps({'type': 'end'}))
            while ws.receive_json()['type'] != 'done':
                pass
            self.closed(ws)
        self.assertEqual((FakeSession.made[0].args[:4], FakeSession.made[0].open_end), ((78, 1, 114, 6), True))
        kept = json.loads(self.stored[f"recite-tests/tester1/{ready['take']}.json"])
        self.assertEqual((kept['request']['s2'], kept['request']['a2'], kept['request']['open']), (None, None, True))
        FakeSession.made = []
        with self.socket() as ws:
            ws.send_text(start(s=78, a=1, s2=78, a2=40))
            ws.receive_json()
        self.assertEqual((FakeSession.made[0].args[:4], FakeSession.made[0].open_end), ((78, 1, 78, 40), False))

    def test_start_anywhere_on_the_page(self):
        """startBy (protocol 6) reaches the session as (sura, ayah) and is kept with the take's request; a start frame
        without it passes nothing new (protocol 5's session, unchanged)."""
        with self.socket() as ws:
            ws.send_text(start(s=2, a=6, startBy=[2, 16], keep=True))
            ready = ws.receive_json()
            ws.send_bytes(second_of_audio())
            ws.send_text(json.dumps({'type': 'end'}))
            while ws.receive_json()['type'] != 'done':
                pass
            self.closed(ws)
        self.assertEqual(ready['protocol'], 7)
        self.assertEqual(FakeSession.made[0].kw, {'start_by': (2, 16)})
        self.assertEqual(FakeSession.made[0].args[:4], (2, 6, 114, 6))
        kept = json.loads(self.stored[f"recite-tests/tester1/{ready['take']}.json"])
        self.assertEqual(kept['request']['startBy'], [2, 16])
        self.assertEqual(server.start_note(server.Live('t', 'u', FakeSession.made[0], False, {'startBy': [2, 16]},
                                                       None)), 'no lock in 1.0 s')
        found = server.Live('t', 'u', FakeSession.made[0], False, {'startBy': [2, 16]}, None)
        found.events = [{'type': 'locked', 'w': 6090, 's': 2, 'a': 9, 't': 2.5}]
        self.assertEqual(server.start_note(found), 'locked at 2.5 s (1 locks)')  # numbers only: no word or ayah
        self.assertEqual(server.start_note(server.Live('t', 'u', FakeSession.made[0], False, {}, None)), '-')
        FakeSession.made = []
        with self.socket() as ws:
            ws.send_text(start(s=2, a=6))
            ws.receive_json()
        self.assertEqual(FakeSession.made[0].kw, {})
        self.assertEqual(self.client.get('/health').json()['protocol'], 7)

    def test_anywhere_in_the_quran(self):
        """startIn "quran" (protocol 7) reaches the session as start_in, only with startBy (the page is searched
        first), and is kept with the take's request; the page's 400-word check stays."""
        with self.socket() as ws:
            ws.send_text(start(s=2, a=6, startBy=[2, 16], startIn='quran', keep=True))
            ready = ws.receive_json()
            ws.send_text(json.dumps({'type': 'end'}))
            while ws.receive_json()['type'] != 'done':
                pass
            self.closed(ws)
        self.assertEqual(FakeSession.made[0].kw, {'start_by': (2, 16), 'start_in': 'quran'})
        kept = json.loads(self.stored[f"recite-tests/tester1/{ready['take']}.json"])
        self.assertEqual(kept['request']['startIn'], 'quran')
        for kw in ({'startIn': 'quran'}, {'startBy': [2, 16], 'startIn': 'everywhere'}):
            FakeSession.made = []
            with self.socket() as ws:
                ws.send_text(start(s=2, a=6, **kw))
                ws.receive_json()
            self.assertNotIn('start_in', FakeSession.made[0].kw, kw)
        with self.socket() as ws:  # a page of more than 400 words is still refused
            ws.send_text(start(s=2, a=6, startBy=[2, 60], startIn='quran'))
            self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'bad_request'})

    def test_a_follower_without_start_in_keeps_protocol_6(self):
        """Deployed before the Qur'an-wide follower: the server says 6 and ignores startIn, so the phone never waits
        for a lock off the page that can't come."""
        class Page(FakeSession):
            def __init__(self, engine, s, a, s2, a2, settings, follow=False, defer=False, open_end=False,
                         start_by=None):
                super().__init__(engine, s, a, s2, a2, settings, follow, defer, open_end, start_by=start_by)
        with mock.patch.object(live, 'LiveSession', Page), self.socket() as ws:
            ws.send_text(start(s=2, a=6, startBy=[2, 16], startIn='quran'))
            ready = ws.receive_json()
            self.assertEqual(self.client.get('/health').json()['protocol'], 6)
        self.assertEqual(ready['protocol'], 6)
        self.assertEqual(FakeSession.made[0].kw, {'start_by': (2, 16)})

    def test_a_follower_without_start_by_keeps_protocol_5(self):
        """Deployed before the model session's follower: the server says 5 and ignores startBy (as a protocol 5
        server does), so the phone never waits for a `locked` that can't come."""
        class Old(FakeSession):
            def __init__(self, engine, s, a, s2, a2, settings, follow=False, defer=False, open_end=False):
                super().__init__(engine, s, a, s2, a2, settings, follow, defer, open_end)
        with mock.patch.object(live, 'LiveSession', Old), self.socket() as ws:
            ws.send_text(start(s=2, a=6, startBy=[2, 999]))  # not even checked
            ready = ws.receive_json()
            ws.send_text(json.dumps({'type': 'seek', 'w': 6170, 'startBy': [2, 24]}))
            ws.send_text(json.dumps({'type': 'end'}))
            while ws.receive_json()['type'] != 'done':
                pass
            self.assertEqual(self.client.get('/health').json()['protocol'], 5)
        self.assertEqual(ready['protocol'], 5)
        self.assertEqual(FakeSession.made[0].kw, {})
        self.assertEqual(FakeSession.made[0].controls[0], {'type': 'seek', 'w': 6170})

    def test_a_bad_start_by_is_refused(self):
        for bad in ([2], ['2', '16'], [2, True], [2, 5], [2, 999], [3, 1], [2, 50]):
            with self.subTest(startBy=bad), self.socket() as ws:
                # [2, 5] is before s:a; [3, 1] past the passage's end; [2, 50] 450 words from s:a (at most 400)
                ws.send_text(start(s=2, a=6, s2=2, a2=255, startBy=bad))
                self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'bad_request'})
        self.assertEqual(FakeSession.made, [])

    def test_a_seek_may_carry_start_by(self):
        """A hand page-turn before (or after) the lock: seek with startBy, as a tuple; one that isn't [sura, ayah] is
        dropped, as a bad frame is."""
        with self.socket() as ws:
            ws.send_text(start(s=2, a=6, startBy=[2, 16]))
            ws.receive_json()
            for c in ({'type': 'seek', 'w': 6170, 'startBy': [2, 24]}, {'type': 'seek', 'w': 6170, 'startBy': 'x'},
                      {'type': 'seek', 'w': 6250}, {'type': 'end'}):
                ws.send_text(json.dumps(c))
            while ws.receive_json()['type'] != 'done':
                pass
        self.assertEqual(FakeSession.made[0].controls, [
            {'type': 'seek', 'w': 6170, 'startBy': (2, 24)}, {'type': 'seek', 'w': 6250}, {'type': 'end'}])

    def test_recite_mode_and_the_tajweed_switch_reach_the_session(self):
        for extra, follow, tajweed in (({'mode': 'recite'}, True, '1'), ({'follow': True}, True, '1'),
                                       ({'mode': 'check', 'tajweed': False}, False, '0')):
            FakeSession.made = []
            with self.socket() as ws:
                ws.send_text(start(**extra))
                ws.receive_json()
            self.assertEqual((FakeSession.made[0].follow, FakeSession.made[0].args[4]['tajweed']), (follow, tajweed))

    def test_a_recite_take_ends_with_done(self):
        with self.socket() as ws:
            ws.send_text(start(follow=True, keep=True))
            ready = ws.receive_json()
            ws.send_bytes(second_of_audio() * 3)
            ws.send_text(json.dumps({'type': 'end'}))
            while True:
                e = ws.receive_json()
                if e['type'] in ('done', 'error'):
                    break
            self.closed(ws)
        self.assertEqual(e['type'], 'done')
        self.assertTrue(e['result']['follow'])
        self.assertEqual((e['result']['marks'], e['result']['score']), ([], None))
        self.assertIn(f"recite-tests/tester1/{ready['take']}.json", self.stored)

    def closed(self, ws):
        """Read until the server closes the socket: with keep on, it closes only once the take is stored (`kept`),
        since `done` goes before the upload. A test that checks the store after `done` waits for this first."""
        got = []
        try:
            while True:
                got.append(ws.receive_json())
        except WebSocketDisconnect:
            return got

    def end_a_take(self, ws, follow=False, keep=True):
        ws.send_text(start(follow=follow, keep=keep))
        ready = ws.receive_json()
        ws.send_bytes(second_of_audio() * 3)
        ws.send_text(json.dumps({'type': 'end'}))
        while True:
            e = ws.receive_json()
            if e['type'] == 'done':
                return ready, e

    def test_done_goes_before_the_take_is_kept(self):
        """Stop answers at once: `done` reaches the phone while the upload is still going; `kept` says when it's
        stored."""
        gate, put = threading.Event(), self.put

        def slow_put(name, data, ct):
            gate.wait(5)
            put(name, data, ct)
        with mock.patch.object(store, 'put', slow_put):
            with self.socket() as ws:
                ready, done = self.end_a_take(ws)
                self.assertEqual(self.stored, {})  # nothing stored yet, and `done` is here
                gate.set()
                self.assertEqual(ws.receive_json(), {'type': 'kept', 'take': ready['take'], 'ok': True, 't': 3.0})
        self.assertIn(f"recite-tests/tester1/{ready['take']}.wav", self.stored)

    def test_a_failed_upload_still_answers(self):
        def broken(name, data, ct):
            raise RuntimeError('storage is down')
        with mock.patch.object(store, 'put', broken):
            with self.socket() as ws:
                ready, done = self.end_a_take(ws)
                self.assertEqual(done['result']['why'], 'end')
                self.assertEqual(ws.receive_json()['ok'], False)

    def test_a_resume_after_the_end_gets_the_same_done(self):
        """The phone missed `done` (or couldn't read it) and came back with resume: the same answer, no second run
        and no second upload."""
        for follow in (False, True):
            FakeSession.made, self.stored = [], {}
            with self.socket() as ws:
                ready, done = self.end_a_take(ws, follow=follow)
                self.closed(ws)
            with self.socket() as ws:
                ws.send_text(start(follow=follow, keep=True, resume=ready['take']))
                again = ws.receive_json()
                self.assertEqual((again['type'], again['take'], again['from']), ('ready', ready['take'], 3 * SR))
                self.assertEqual(ws.receive_json(), done)
                with self.assertRaises(WebSocketDisconnect):
                    ws.receive_json()
            self.assertEqual(len(FakeSession.made), 1)
            self.assertEqual(len(self.stored), 2)

    def test_a_take_run_again_elsewhere_keeps_the_first_copy(self):
        """The other instance finishes a take this one already kept (its `done` was missed): the name is taken, so
        the first copy stays, and the phone still hears `kept`."""
        with self.socket() as ws:
            ready, _ = self.end_a_take(ws)
            self.closed(ws)
        first = dict(self.stored)
        server.FINISHED.clear()  # as on the other instance
        with self.socket() as ws:
            ws.send_text(start(keep=True, resume=ready['take']))
            self.assertEqual(ws.receive_json()['from'], 0)
            ws.send_bytes(second_of_audio() * 3)
            ws.send_text(json.dumps({'type': 'end'}))
            while ws.receive_json()['type'] != 'done':
                pass
            self.assertEqual(ws.receive_json()['ok'], True)
        self.assertEqual(self.stored, first)

    def test_a_phone_gone_before_an_event_is_not_a_failure(self):
        """uvicorn refuses a send after the phone closed ("Unexpected ASGI message 'websocket.send'"): the socket
        ends as a drop (what came is kept), not as a server failure."""
        real = server.WebSocket.send_text
        refused = threading.Event()

        async def send_text(ws_, data):
            if '"type": "at"' in data:
                refused.set()
                raise RuntimeError("Unexpected ASGI message 'websocket.send', after sending 'websocket.close'")
            return await real(ws_, data)
        with mock.patch.object(server.WebSocket, 'send_text', send_text), \
                mock.patch.object(server.log, 'exception') as failed:
            with self.socket() as ws:
                ws.send_text(start(keep=True))
                ws.receive_json()
                ws.send_bytes(second_of_audio() * 3)
                # leave only once the server has checked the audio and tried to answer: closing first could end the
                # handler before the audio was read, with nothing to keep (Cloud Build, Nov 15 2026: 1 in ~40 runs)
                self.assertTrue(refused.wait(10))
            for _ in range(100):
                if any('.part-' in n for n in self.stored):
                    break
                time.sleep(0.02)
        failed.assert_not_called()
        self.assertTrue(any('.part-' in n for n in self.stored))

    def test_hints_reach_the_session_and_unknown_frames_are_ignored(self):
        with self.socket() as ws:
            ws.send_text(start(keep=True))
            ready = ws.receive_json()
            ws.send_text(json.dumps({'type': 'hint', 'w': 3, 'what': 'word'}))
            ws.send_text(json.dumps({'type': 'whatever', 'x': 1}))
            ws.send_text('not json')
            ws.send_bytes(second_of_audio())
            ws.send_text(json.dumps({'type': 'end'}))
            while ws.receive_json()['type'] != 'done':
                pass
            self.closed(ws)
        self.assertEqual(FakeSession.made[0].hints, [{'type': 'hint', 'w': 3, 'what': 'word'}])
        kept = json.loads(self.stored[f"recite-tests/tester1/{ready['take']}.json"])
        self.assertEqual(kept['hints'], [{'type': 'hint', 'w': 3, 'what': 'word'}])

    def test_nothing_kept_without_keep(self):
        with self.socket() as ws:
            ws.send_text(start())
            ws.receive_json()
            ws.send_bytes(second_of_audio() * 3)
            ws.send_text(json.dumps({'type': 'end'}))
            while ws.receive_json()['type'] != 'done':
                pass
        self.assertEqual(self.stored, {})

    def test_audio_sent_faster_than_it_is_checked_is_read_at_once_and_merged_in_order(self):
        """A resume resends the take as fast as the phone can: the socket is read at once (or it would stop
        answering pings), and the queued audio reaches the checker in fewer, bigger pieces, in order."""
        calls = []
        slow = FakeSession.feed

        def feed(sess, data):
            calls.append(len(data))
            time.sleep(0.05)
            return slow(sess, data)
        with mock.patch.object(FakeSession, 'feed', feed):
            with self.socket() as ws:
                ws.send_text(start())
                ws.receive_json()
                for _ in range(40):
                    ws.send_bytes(b'\1\0' * 1600)  # 4 s of audio at once
                ws.send_text(json.dumps({'type': 'dismiss', 'id': '101:skipped:'}))
                ws.send_text(json.dumps({'type': 'end'}))
                types = []
                while True:
                    e = ws.receive_json()
                    types.append(e['type'])
                    if e['type'] == 'done':
                        break
        self.assertEqual(sum(calls), 40 * 3200)
        self.assertLess(len(calls), 40)
        self.assertEqual(FakeSession.made[0].dismissed, {'101:skipped:'})
        self.assertEqual(types.count('at'), 4)

    def test_idle_socket_is_closed(self):
        with mock.patch.object(server, 'IDLE', 0.3):
            with self.socket() as ws:
                ws.send_text(start())
                ws.receive_json()
                self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'idle'})

    def test_resume_on_the_same_instance(self):
        with self.socket() as ws:
            ws.send_text(start(keep=True))
            sid = ws.receive_json()['take']
            ws.send_bytes(second_of_audio() * 3)
            for _ in range(4):
                ws.receive_json()
        # dropped without a stop: what came so far is kept as a part, and the session waits
        for _ in range(100):  # the server notices the drop after the client has gone
            parts = [n for n in self.stored if '.part-' in n]
            if len(parts) == 2:
                break
            time.sleep(0.02)
        self.assertEqual(len(parts), 2)
        with self.socket() as ws:
            ws.send_text(start(token='good', resume=sid))
            ready = ws.receive_json()
            self.assertEqual((ready['take'], ready['from']), (sid, 3 * SR))
            self.assertEqual(ws.receive_json(), {'type': 'at', 'w': 103, 't': 3.0})  # the snapshot
            ws.send_bytes(second_of_audio())
            self.assertEqual(ws.receive_json()['w'], 104)
            ws.send_text(json.dumps({'type': 'stop'}))  # the old name still ends a take
            self.assertEqual(ws.receive_json()['result']['secs'], 4.0)
            self.closed(ws)
        self.assertEqual(len(FakeSession.made), 1)
        self.assertIn(f'recite-tests/tester1/{sid}.wav', self.stored)

    def test_resume_elsewhere_starts_again_under_the_same_name(self):
        sid = '20261113-101010-abcdef'
        with self.socket() as ws:
            ws.send_text(start(resume=sid))
            ready = ws.receive_json()
            self.assertEqual((ready['take'], ready['from']), (sid, 0))

    def test_someone_else_cannot_resume(self):
        with self.socket() as ws:
            ws.send_text(start())
            sid = ws.receive_json()['take']
            ws.send_bytes(second_of_audio())
            ws.receive_json()
        with self.socket() as ws:
            ws.send_text(start(token='other', resume=sid))
            self.assertEqual(ws.receive_json()['from'], 0)
        self.assertEqual(len(FakeSession.made), 2)

    def test_sessions_count_against_the_hourly_limit(self):
        with mock.patch.object(server, 'limiter', auth.Limiter(2)):
            for expect in ('ready', 'ready', 'error'):
                with self.socket() as ws:
                    ws.send_text(start())
                    self.assertEqual(ws.receive_json()['type'], expect)



class CheckGateTests(Base):
    """Check is a Premium feature (apply-support.md): with the gate on, /check and /live without follow need Premium;
    Recite (follow) doesn't. tester1 has Premium, tester2 doesn't."""

    def test_off_by_default(self):
        self.assertFalse(server.CHECK_GATE)
        r = self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer other'})
        self.assertEqual(r.status_code, 200)

    def test_check_needs_the_entitlement(self):
        with mock.patch.object(server, 'CHECK_GATE', True):
            r = self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer other'})
            self.assertEqual((r.status_code, r.json()), (403, {'error': 'premium_required'}))
            r = self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer good'})
            self.assertEqual(r.status_code, 200)

    def test_live_check_needs_it_recite_does_not(self):
        with mock.patch.object(server, 'CHECK_GATE', True):
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(token='other'))
                self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'premium_required'})
            for extra in ({'follow': True}, {'mode': 'recite'}):
                with self.client.websocket_connect('/live') as ws:
                    ws.send_text(start(token='other', **extra))
                    self.assertEqual(ws.receive_json()['type'], 'ready')
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(token='good'))
                self.assertEqual(ws.receive_json()['type'], 'ready')


class ProductionSwitchTests(Base):
    """The switches production sets (checker-prod.md): each one's default is what dev's services have always done."""

    def take_lines(self):
        return [f for k, f in self.health if k == 'take']

    def test_testers_only_unless_turned_off(self):
        self.assertTrue(server.TESTERS_ONLY)
        h = {'Authorization': 'Bearer plain'}  # signed in, not a previewTester
        self.assertEqual(self.client.post('/check?s=1&a=1', content=wav(), headers=h).status_code, 403)
        with mock.patch.object(server, 'TESTERS_ONLY', False):
            self.assertEqual(self.client.post('/check?s=1&a=1', content=wav(), headers=h).status_code, 200)
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(token='plain'))
                self.assertEqual(ws.receive_json()['type'], 'ready')
            # still a sign-in
            self.assertEqual(self.client.post('/check?s=1&a=1', content=wav()).status_code, 401)

    def test_app_check_off_by_default(self):
        self.assertEqual(server.APP_CHECK, 'off')
        self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer good'})
        self.assertNotIn('appcheck', self.take_lines()[-1])

    def judge(self, token, number):
        self.assertEqual(number, '123456')
        return {None: 'missing', 'good-ac': 'ok'}.get(token, 'bad')

    def test_app_check_log_counts_and_refuses_nothing(self):
        with mock.patch.object(server, 'APP_CHECK', 'log'), mock.patch.object(server, 'PROJECT_NUMBER', '123456'), \
                mock.patch.object(auth, 'app_check', self.judge):
            h = {'Authorization': 'Bearer good'}
            for ac, want in ((None, 'missing'), ('good-ac', 'ok'), ('forged', 'bad')):
                r = self.client.post('/check?s=1&a=1', content=wav(),
                                     headers=h | ({'X-Firebase-AppCheck': ac} if ac else {}))
                self.assertEqual(r.status_code, 200)
                self.assertEqual(self.take_lines()[-1]['appcheck'], want)
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(appCheck='good-ac'))
                ready = ws.receive_json()
                self.assertEqual(server.SESSIONS[ready['take']].appcheck, 'ok')

    def test_app_check_on_refuses_without_a_good_token(self):
        with mock.patch.object(server, 'APP_CHECK', 'on'), mock.patch.object(server, 'PROJECT_NUMBER', '123456'), \
                mock.patch.object(auth, 'app_check', self.judge):
            h = {'Authorization': 'Bearer good'}
            for ac in (None, 'forged'):
                r = self.client.post('/check?s=1&a=1', content=wav(),
                                     headers=h | ({'X-Firebase-AppCheck': ac} if ac else {}))
                self.assertEqual((r.status_code, r.json()), (401, {'error': 'app_check'}))
                r = self.client.post('/dismiss', json={'take': '20261113-101010-abcdef', 'id': '12:skipped:'},
                                     headers=h | ({'X-Firebase-AppCheck': ac} if ac else {}))
                self.assertEqual(r.status_code, 401)
            r = self.client.post('/check?s=1&a=1', content=wav(), headers=h | {'X-Firebase-AppCheck': 'good-ac'})
            self.assertEqual(r.status_code, 200)
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start())
                self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'app_check'})
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(appCheck='good-ac'))
                self.assertEqual(ws.receive_json()['type'], 'ready')
            with self.client.websocket_connect('/live', headers={'X-Firebase-AppCheck': 'good-ac'}) as ws:
                ws.send_text(start())  # or in the header
                self.assertEqual(ws.receive_json()['type'], 'ready')
        self.assertIn(('refused', {'route': 'check', 'reason': 'app_check'}), self.health)

    def test_app_check_keys_unreachable(self):
        def gone(token, number):
            raise auth.Unreachable('App Check keys')
        h = {'Authorization': 'Bearer good', 'X-Firebase-AppCheck': 'good-ac'}
        with mock.patch.object(server, 'PROJECT_NUMBER', '123456'), mock.patch.object(auth, 'app_check', gone):
            with mock.patch.object(server, 'APP_CHECK', 'log'):  # counted, not refused
                self.assertEqual(self.client.post('/check?s=1&a=1', content=wav(), headers=h).status_code, 200)
                self.assertEqual(self.take_lines()[-1]['appcheck'], 'unreachable')
            with mock.patch.object(server, 'APP_CHECK', 'on'):  # the server's failure, as Firestore's is
                self.assertEqual(self.client.post('/check?s=1&a=1', content=wav(), headers=h).status_code, 500)

    def test_switches_are_checked_at_start(self):
        for mode, number in (('maybe', ''), ('on', ''), ('log', 'revision-buddy-3a398'), ('ON', '1')):
            self.assertTrue(server.switches_wrong(mode, number), (mode, number))
        for mode, number in (('off', ''), ('log', '123456789012'), ('on', '123456789012')):
            self.assertIsNone(server.switches_wrong(mode, number), (mode, number))

    def test_paused(self):
        h = {'Authorization': 'Bearer good'}
        with self.client.websocket_connect('/live') as ws:  # a take under way before the switch
            ws.send_text(start())
            ready = ws.receive_json()
            ws.send_bytes(second_of_audio())
        with mock.patch.object(server, 'PAUSED', True):
            self.assertIs(self.client.get('/health').json()['paused'], True)
            r = self.client.post('/check?s=1&a=1', content=wav(), headers=h)
            self.assertEqual((r.status_code, r.json()), (503, {'error': 'paused'}))
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start())
                self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'paused'})
            with self.client.websocket_connect('/live') as ws:  # its resume goes on
                ws.send_text(start(resume=ready['take']))
                self.assertEqual(ws.receive_json()['type'], 'ready')
        self.assertNotIn('paused', self.client.get('/health').json())
        self.assertIn(('refused', {'route': 'live', 'reason': 'paused'}), self.health)

    def test_nothing_kept_without_a_bucket(self):
        h = {'Authorization': 'Bearer good'}
        with mock.patch.object(store, 'BUCKET', ''):
            r = self.client.post('/check?s=1&a=1&s2=1&a2=7&v=2&keep=1', content=wav(), headers=h)
            self.assertEqual(r.status_code, 200)
            self.assertNotIn('kept', r.json())
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(keep=True))
                ready = ws.receive_json()
                self.assertIs(server.SESSIONS[ready['take']].keep, False)
            r = self.client.post('/dismiss', json={'take': '20261113-101010-abcdef', 'id': '12:skipped:'}, headers=h)
            self.assertEqual(r.json(), {'ok': True, 'kept': False})
        self.assertEqual(self.stored, {})
        self.assertIn(('label', {'kind': 'dismiss', 'kept': False}), self.health)


class AppCheckTests(unittest.TestCase):
    """auth.app_check against tokens signed here, as App Check signs them (RS256, a key from its JWKS)."""
    NUMBER = '123456789012'

    @classmethod
    def setUpClass(cls):
        cls.pub, cls.priv = rsa.newkeys(1024)
        cls.other_pub, cls.other_priv = rsa.newkeys(1024)

    def setUp(self):
        auth._jwks.update(keys={}, at=None, tried=None)
        self.addCleanup(auth._jwks.update, keys={}, at=None, tried=None)
        self.fetches = 0
        self.jwks_up = True

    def jwk(self, kid, pub):
        b = lambda n: auth.base64.urlsafe_b64encode(n.to_bytes((n.bit_length() + 7) // 8, 'big')).rstrip(b'=').decode()  # noqa: E731
        return {'kty': 'RSA', 'use': 'sig', 'alg': 'RS256', 'kid': kid, 'n': b(pub.n), 'e': b(pub.e)}

    def get(self, url, timeout):
        self.assertEqual(url, auth.APP_CHECK_JWKS)
        self.fetches += 1
        if not self.jwks_up:
            raise requests.ConnectionError('down')
        body = {'keys': [self.jwk('k1', self.pub)]}

        class R:
            status_code = 200

            def json(self):
                return body
        return R()

    def token(self, priv=None, kid='k1', **claims):
        now = int(time.time())
        payload = {'iss': f'https://firebaseappcheck.googleapis.com/{self.NUMBER}', 'sub': '1:1:ios:abc',
                   'aud': [f'projects/{self.NUMBER}', 'projects/revision-buddy-3a398'], 'iat': now, 'exp': now + 3600}
        payload.update(claims)
        signer = google.auth.crypt.RSASigner.from_string((priv or self.priv).save_pkcs1())
        return google.auth.jwt.encode(signer, {k: v for k, v in payload.items() if v is not None},
                                      key_id=kid).decode()

    def judge(self, token):
        with mock.patch.object(auth.requests, 'get', self.get):
            return auth.app_check(token, self.NUMBER)

    def test_a_good_token(self):
        self.assertEqual(self.judge(self.token()), 'ok')
        self.assertEqual(self.judge(self.token(aud=f'projects/{self.NUMBER}')), 'ok')  # one audience, not a list
        self.assertEqual(self.fetches, 1)  # the keys are kept

    def test_missing_and_malformed(self):
        for t in (None, ''):
            self.assertEqual(self.judge(t), 'missing')
        for t in ('x', 'a.b.c', 'a.b', 12, 'x' * 9000):
            self.assertEqual(self.judge(t), 'bad', t)
        self.assertEqual(self.fetches, 0)

    def test_bad_tokens(self):
        now = int(time.time())
        for t in (self.token(priv=self.other_priv),  # not App Check's signature
                  self.token(iss='https://firebaseappcheck.googleapis.com/999'),  # another project
                  self.token(aud=['projects/999']),
                  self.token(aud=None),
                  self.token(iat=now - 7200, exp=now - 3600),  # expired
                  self.token(iss='https://securetoken.google.com/revision-buddy-3a398')):  # an ID token's issuer
            self.assertEqual(self.judge(t), 'bad')

    def test_an_unknown_key_fetches_again_at_most_once_a_minute(self):
        self.assertEqual(self.judge(self.token()), 'ok')
        self.assertEqual(self.judge(self.token(kid='k9')), 'bad')  # within the minute: no second fetch
        self.assertEqual(self.fetches, 1)
        auth._jwks['tried'] -= auth.APP_CHECK_REFETCH + 1
        self.assertEqual(self.judge(self.token(kid='k9')), 'bad')  # fetched again (App Check may have rotated)
        self.assertEqual(self.judge(self.token(kid='k9')), 'bad')
        self.assertEqual(self.fetches, 2)

    def test_keys_that_cant_be_fetched(self):
        self.jwks_up = False
        with self.assertRaises(auth.Unreachable):
            self.judge(self.token())
        self.jwks_up = True
        auth._jwks['tried'] = None
        self.assertEqual(self.judge(self.token()), 'ok')
        # later, Google down: the keys held still work
        self.jwks_up = False
        auth._jwks.update(at=0, tried=None)  # stale
        self.assertEqual(self.judge(self.token()), 'ok')

    def test_no_algorithm_switching(self):
        head = auth.base64.urlsafe_b64encode(json.dumps({'alg': 'none', 'typ': 'JWT', 'kid': 'k1'}).encode())
        body = self.token().split('.')[1]
        self.assertEqual(self.judge(f"{head.rstrip(b'=').decode()}.{body}."), 'bad')


class EntitlementTests(unittest.TestCase):
    """auth.has_check reads entitlements/{uid}.premium over Firestore REST (only `premium`: `grants` is ignored)."""

    def ts(self, when):
        import datetime
        return {'timestampValue': datetime.datetime.fromtimestamp(when, datetime.timezone.utc)
                .isoformat().replace('+00:00', 'Z')}

    def test_until(self):
        now = 1_800_000_000
        self.assertFalse(auth.check_open(None, now))
        self.assertTrue(auth.check_open({'mapValue': {'fields': {'source': {'stringValue': 'support'}}}}, now))
        self.assertTrue(auth.check_open({'mapValue': {'fields': {'until': {'nullValue': None}}}}, now))
        self.assertTrue(auth.check_open({'mapValue': {'fields': {'until': self.ts(now + 60)}}}, now))
        self.assertFalse(auth.check_open({'mapValue': {'fields': {'until': self.ts(now - 60)}}}, now))
        self.assertFalse(auth.check_open({'mapValue': {'fields': {'until': {'timestampValue': 'soon'}}}}, now))

    def test_read_and_cache(self):
        class R:
            def __init__(self, code, body=None):
                self.status_code, self.body = code, body or {}

            def json(self):
                return self.body

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise RuntimeError(self.status_code)
        dev = {'mapValue': {'fields': {'source': {'stringValue': 'dev'}, 'until': {'nullValue': None}}}}
        answers = {'nobody': R(404), 'granted': R(200, {'fields': {'premium': dev, 'grants': {'mapValue': {'fields': {
            'dev': dev}}}}}), 'empty': R(200, {}),
            # a grant left in `grants` without `premium` (revoked, or mid-write) doesn't count
            'grants_only': R(200, {'fields': {'grants': {'mapValue': {'fields': {'dev': dev}}}}})}
        calls = []

        def get(url, headers, timeout):
            calls.append(url)
            return answers[url.split('/entitlements/')[1].split('?')[0]]
        auth._checks.clear()
        with mock.patch.object(auth.requests, 'get', get), mock.patch.object(auth, 'token', lambda: 'x'):
            self.assertFalse(auth.has_check('nobody', now=100))
            self.assertTrue(auth.has_check('granted', now=100))
            self.assertFalse(auth.has_check('empty', now=100))
            self.assertFalse(auth.has_check('grants_only', now=100))
            self.assertTrue(auth.has_check('granted', now=150))  # cached
            self.assertEqual(len(calls), 4)
            self.assertTrue(auth.has_check('granted', now=100 + auth.CHECK_TTL + 1))  # read again
            self.assertEqual(len(calls), 5)
            self.assertIn('mask.fieldPaths=premium', calls[0])
            # a no is trusted for less (CHECK_TTL_NO): a grant written just after sign-up unlocks within seconds
            self.assertFalse(auth.has_check('nobody', now=105))
            self.assertEqual(len(calls), 5)
            answers['nobody'] = answers['granted']
            self.assertTrue(auth.has_check('nobody', now=100 + auth.CHECK_TTL_NO + 1))
            self.assertEqual(len(calls), 6)
        auth._checks.clear()

    def test_the_field_is_one_setting(self):
        """The field is the ENTITLEMENT setting: another name (draft 1's `check`) is a deploy-time change."""
        seen = []

        class R:
            status_code = 200

            def json(self):
                return {'fields': {'check': {'mapValue': {'fields': {'until': {'nullValue': None}}}}}}

            def raise_for_status(self):
                pass

        def get(url, headers, timeout):
            seen.append(url)
            return R()
        auth._checks.clear()
        with mock.patch.object(auth, 'ENTITLEMENT', 'check'), mock.patch.object(auth.requests, 'get', get), \
                mock.patch.object(auth, 'token', lambda: 'x'):
            self.assertTrue(auth.has_check('someone', now=100))
        self.assertIn('mask.fieldPaths=check', seen[0])
        auth._checks.clear()



class NoUidInLogsTests(unittest.TestCase):
    """requests names the URL in its errors, and Firestore's and Storage's URLs hold the uid: what the service raises
    (and logs, with its traceback) names only the status or the kind of failure."""
    UID = 'U1d0fAnAccount0000000000000'

    def logged(self, fn):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            return e, ''.join(traceback.format_exception(e))
        self.fail('no error')

    def test_storage_failures(self):
        name = store.name_for(self.UID, 'take')
        down = requests.ConnectionError(f'Max retries exceeded with url: /upload?name=recite-tests%2F{self.UID}')

        def unreachable(url, **kw):
            raise down

        class R:
            def __init__(self, code):
                self.status_code = code
        with mock.patch.object(auth, 'token', lambda: 'x'):
            for post in (unreachable, lambda url, **kw: R(500), lambda url, **kw: R(412)):
                with mock.patch.object(store.requests, 'post', post):
                    e, text = self.logged(lambda: store.put(name, b'x', 'audio/wav'))
                self.assertIsInstance(e, (auth.Unreachable, store.Exists))
                self.assertNotIn(self.UID, text + repr(e))
        self.assertEqual(str(self.logged(lambda: auth.call(unreachable, name))[0]), 'ConnectionError')

    def test_firestore_failures(self):
        class R:
            status_code = 503
        auth._testers.clear()
        auth._checks.clear()
        with mock.patch.object(auth, 'token', lambda: 'x'), \
                mock.patch.object(auth.requests, 'get', lambda url, **kw: R()):
            for read in (auth.is_tester, auth.has_check):
                e, text = self.logged(lambda: read(self.UID))
                self.assertEqual(str(e), 'HTTP 503')
                self.assertNotIn(self.UID, text)
        self.assertEqual((auth._testers, auth._checks), ({}, {}))  # a failure isn't cached as a no


class HealthTests(Base):
    """One numbers-only line per take, refusal, label, dropped session and instance start (health.py): never a uid,
    a take's name, a passage or a word."""

    def lines(self, kind):
        return [f for k, f in self.health if k == kind]

    def assertNothingPersonal(self, fields, *secrets):
        text = json.dumps(fields)
        for secret in ('tester1', '"s"', '"a"', 'startBy', '"w"') + secrets:
            self.assertNotIn(secret, text)
        for k, v in fields.items():
            self.assertTrue(isinstance(v, (int, float, bool)) or (isinstance(v, str) and len(v) <= 48), (k, v))

    def test_an_instance_says_where_its_start_went(self):
        (line,) = self.lines('instance')
        self.assertEqual(set(line) - {'imports_s', 'engine_s', 'ready_s', 'words', 'bench_ms', 'engine', 'server'},
                         set())
        self.assertIs(line['words'], False)
        self.assertGreater(line['bench_ms'], 0)

    def test_a_live_take(self):
        with self.client.websocket_connect('/live') as ws:
            ws.send_text(start(keep=True, letters=True, app='1.0.4 (40) dev 3fa9c1d2'))
            take = ws.receive_json()['take']
            for _ in range(20):
                ws.send_bytes(b'\1\0' * 1600)
            ws.send_text(json.dumps({'type': 'end'}))
            while ws.receive_json()['type'] != 'kept':
                pass
        (line,) = self.lines('take')
        self.assertEqual({k: line[k] for k in ('kind', 'level', 'start', 'audio_s', 'sockets', 'cold', 'restarted',
                                               'why', 'kept', 'app', 'protocol', 'ear')},
                         {'kind': 'live', 'level': 'strict+letters', 'ear': 'released+v5', 'start': 'fixed',
                          'audio_s': 2.0, 'sockets': 1,
                          'cold': True, 'restarted': False, 'why': 'end', 'kept': True, 'app': '1.0.4 (40) dev 3fa9c1d2',
                          'protocol': 7})
        for k in ('open_s', 'ready_s', 'age_s', 'cpu_s', 'lag_p50', 'lag_p90', 'lag_max'):
            self.assertGreaterEqual(line[k], 0, k)
        self.assertLessEqual(line['lag_p50'], line['lag_max'])
        self.assertNothingPersonal(line, take)

    def test_the_second_take_on_an_instance_is_not_cold_and_recite_says_so(self):
        for follow in (False, True):
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(follow=follow, tajweed=False))
                ws.receive_json()
                ws.send_bytes(second_of_audio())
                ws.send_text(json.dumps({'type': 'end'}))
                while ws.receive_json()['type'] != 'done':
                    pass
        self.assertEqual([(f['cold'], f['level'], f.get('kept')) for f in self.lines('take')],
                         [(True, 'harakat', None), (False, 'recite', None)])

    def test_an_app_tag_of_another_shape_is_left_out(self):
        with self.client.websocket_connect('/live') as ws:
            ws.send_text(start(app='me@example.com'))
            ws.receive_json()
            ws.send_text(json.dumps({'type': 'end'}))
            ws.receive_json()
        self.assertNotIn('app', self.lines('take')[0])

    def test_refusals_say_why(self):
        for token in ('bad', 'plain'):
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(token))
                ws.receive_json()
        with self.client.websocket_connect('/live') as ws:
            ws.send_text(json.dumps({'type': 'start', 'token': 'good', 's': 1}))
            ws.receive_json()
        self.client.post('/check?s=1&a=1', content=wav())
        self.assertEqual([(f['route'], f['reason']) for f in self.lines('refused')],
                         [('live', 'sign_in'), ('live', 'testers_only'), ('live', 'bad_request'), ('check', 'sign_in')])

    def test_where_a_take_locked(self):
        s = server.Live('t', 'u', FakeSession(None, 2, 6, None, None, {}), False,
                        {'startBy': [2, 16], 'startIn': 'quran', 'settings': {}, 'follow': True}, None)
        s.events = [{'type': 'locked', 'w': 6090, 's': 2, 'a': 9, 't': 2.5, 'where': 'quran'}]
        f = server.take_fields(s, {'why': 'end', 'ms': {'model': 900, 'search_quran': 30}})
        self.assertEqual((f['start'], f['where'], f['level'], f['ear']), ('quran', 'quran', 'recite', 'v6'))
        self.assertNothingPersonal({k: v for k, v in f.items() if v is not None})

    def test_a_check(self):
        h = {'Authorization': 'Bearer good', 'X-Revisely-App': '1.0.4 (40) dev embedded'}
        self.client.post('/check?s=1&a=1&v=2&tajweed=0', content=wav(3.0), headers=h)
        (line,) = self.lines('take')
        self.assertEqual({k: line[k] for k in ('kind', 'v', 'level', 'ear', 'audio_s', 'cold', 'marks', 'app')},
                         {'kind': 'check', 'v': 2, 'level': 'harakat', 'ear': 'v6', 'audio_s': 3.0, 'cold': True,
                          'marks': 0, 'app': '1.0.4 (40) dev embedded'})
        self.assertNothingPersonal(line)

    def test_labels_are_counted(self):
        h = {'Authorization': 'Bearer good'}
        for route in ('/dismiss', '/undismiss'):
            self.client.post(route, json={'take': '20261113-101010-abcdef', 'id': '12:skipped:'}, headers=h)
        self.assertEqual(self.lines('label'), [{'kind': 'dismiss'}, {'kind': 'undismiss'}])

    def test_a_take_whose_phone_never_came_back(self):
        with self.client.websocket_connect('/live') as ws:
            ws.send_text(start())
            take = ws.receive_json()['take']
            ws.send_bytes(second_of_audio())
            ws.receive_json()
        server.SESSIONS[take].left -= server.RESUME_TTL + 1
        server.forget_old()
        (line,) = self.lines('dropped')
        self.assertEqual({k: line[k] for k in ('at', 'level', 'audio_s', 'sockets', 'restarted')},
                         {'at': 'timeout', 'level': 'strict', 'audio_s': 1.0, 'sockets': 1, 'restarted': False})
        self.assertNothingPersonal(line, take)

    def test_a_resume_this_instance_never_had_is_a_restart(self):
        with self.client.websocket_connect('/live') as ws:
            ws.send_text(start(resume='20261113-101010-abcdef'))
            ws.receive_json()
            ws.send_text(json.dumps({'type': 'end'}))
            ws.receive_json()
        self.assertTrue(self.lines('take')[0]['restarted'])


class LevelTests(Base):
    """A service that takes only some levels (LEVELS: the second service, two takes per instance) refuses the rest
    with `level_elsewhere`, on every socket and every check."""

    def setUp(self):
        super().setUp()
        p = mock.patch.object(server, 'LEVELS', frozenset({'recite', 'harakat'}))
        p.start()
        self.addCleanup(p.stop)

    def first_event(self, **kw):
        with self.client.websocket_connect('/live') as ws:
            ws.send_text(start(**kw))
            return ws.receive_json()

    def test_live(self):
        self.assertEqual(self.first_event(follow=True)['type'], 'ready')
        self.assertEqual(self.first_event(tajweed=False)['type'], 'ready')
        for kw in ({}, {'tajweed': True}, {'tajweed': False, 'letters': True}):
            self.assertEqual(self.first_event(**kw), {'type': 'error', 'reason': 'level_elsewhere'}, kw)
        self.assertEqual(len(FakeSession.made), 2)
        self.assertEqual([f['reason'] for k, f in self.health if k == 'refused'], ['level_elsewhere'] * 3)

    def test_check(self):
        h = {'Authorization': 'Bearer good'}
        self.assertEqual(self.client.post('/check?s=1&a=1&v=2&tajweed=0', content=wav(), headers=h).status_code, 200)
        r = self.client.post('/check?s=1&a=1&v=2', content=wav(), headers=h)
        self.assertEqual((r.status_code, r.json()), (409, {'error': 'level_elsewhere'}))

    def test_health_says_which(self):
        self.assertEqual(self.client.get('/health').json()['levels'], ['harakat', 'recite'])

    def test_every_level_without_it(self):
        with mock.patch.object(server, 'LEVELS', frozenset()):
            self.assertEqual(self.first_event()['type'], 'ready')
            self.assertNotIn('levels', self.client.get('/health').json())


class HealthParts(unittest.TestCase):
    def test_the_line(self):
        out = io.StringIO()
        with mock.patch('sys.stdout', out):
            health.emit('take', audio_s=1.5, kept=None)
        self.assertEqual(json.loads(out.getvalue()),
                         {'severity': 'INFO', 'message': 'health take', 'health': 'take', 'audio_s': 1.5})

    def test_levels(self):
        self.assertEqual([health.level(s, f) for s, f in (({}, True), ({'tajweed': '0'}, False), ({}, False),
                                                           ({'tajweed': '1', 'letters': '1'}, False))],
                         ['recite', 'harakat', 'strict', 'strict+letters'])

    def test_lag_and_cost(self):
        self.assertEqual(health.lag([0.5, 0.1, 0.2, 0.3, 0.4]), {'lag_p50': 0.3, 'lag_p90': 0.5, 'lag_max': 0.5})
        self.assertEqual(health.lag([]), {})
        self.assertEqual(health.per_second({'model': 2400, 'words': 1000, 'hops': 30}, 10.0),
                         {'model_per_s': 0.24, 'words_per_s': 0.1})
        self.assertEqual(health.per_second({'model': 1}, 0), {})
        self.assertGreater(health.age(), 0)


if __name__ == '__main__':
    unittest.main()
