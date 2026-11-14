"""The service's protocol, with the checker stood in (no model needed): sign-in and testers on every request and
socket, /check v1 and v2, /dismiss, and /live (start, events, stop, idle, resume, limits, keeping a take).

  python -m unittest discover -s tests      (from the staged folder, or the image: the Dockerfile runs it)
"""
import io
import json
import logging
import os
import sys
import time
import unittest
import wave
from unittest import mock

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.environ['LIVE_HELPER'] = '0'
logging.disable(logging.INFO)

from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

import auth  # noqa: E402
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

    def __init__(self, engine, s, a, s2, a2, settings, follow=False):
        self.args = (s, a, s2, a2, settings)
        self.follow = follow
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
        if msg['type'] == 'dismiss':
            self.dismissed.add(msg['id'])
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
                self.result = {'v': 2, 'follow': True, 'words': [], 'secs': round(self.seconds, 1), 'why': 'end'}
            return [{'type': 'done', 'result': self.result}]
        return []


def uid_of(header):
    tokens = {'Bearer good': 'tester1', 'Bearer other': 'tester2', 'Bearer plain': 'plain1'}
    if header not in tokens:
        raise auth.Refused(401, 'sign_in')
    return tokens[header]


class Base(unittest.TestCase):
    def setUp(self):
        self.stored = {}
        FakeSession.made = []
        patches = [
            mock.patch.object(server, 'Engine', FakeEngine),
            mock.patch.object(auth, 'uid_of', uid_of),
            mock.patch.object(auth, 'is_tester', lambda uid: uid.startswith('tester')),
            mock.patch.object(auth, 'has_check', lambda uid: uid == 'tester1'),
            mock.patch.object(store, 'put', lambda name, data, ct: self.stored.__setitem__(name, data)),
            mock.patch.object(live, 'LiveSession', FakeSession),
            mock.patch.object(server, 'limiter', auth.Limiter()),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        server.SESSIONS.clear()
        self.client = TestClient(server.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)


class CheckTests(Base):
    def test_health(self):
        r = self.client.get('/health')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body['ok'], body['protocol']), (True, 5))
        self.assertIn('server', body)
        self.assertIn('engine', body)

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
        r = self.client.post('/dismiss', json={'take': '20261113-101010-abcdef', 'id': '12:word:skipped'})
        self.assertEqual(r.status_code, 401)
        h = {'Authorization': 'Bearer good'}
        for body in ({'take': '../other/x', 'id': '12:word:skipped'}, {'take': '20261113-101010-abcdef', 'id': 'x'},
                     {'take': '20261113-101010-abcdef'}):
            self.assertEqual(self.client.post('/dismiss', json=body, headers=h).status_code, 400)
        self.assertEqual(self.stored, {})


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
            self.assertEqual((ready['type'], ready['from'], ready['v'], ready['protocol']), ('ready', 0, 2, 5))
            self.assertTrue(store.TAKE.match(ready['take']))
            self.assertEqual(FakeSession.made[0].args, (1, 1, None, None, {'mon': 5, 'mot': 4, 'aar': 2,
                                                                           'letters': '1', 'tajweed': '1'}))
            self.assertFalse(FakeSession.made[0].follow)
            for _ in range(10):
                ws.send_bytes(b'\1\0' * 1600)  # 100 ms chunks, as micSource sends them
            self.assertEqual(ws.receive_json()['type'], 'at')
            self.assertEqual(ws.receive_json()['mark']['id'], '101:skipped:')
            ws.send_text(json.dumps({'type': 'dismiss', 'id': '101:skipped:'}))
            ws.send_text(json.dumps({'type': 'end'}))
            done = ws.receive_json()
            self.assertEqual((done['type'], done['result']['secs'], done['result']['kept']), ('done', 1.0, True))
            self.assertEqual(done['result']['take'], ready['take'])
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
        self.assertEqual(e['type'], 'done')
        self.assertTrue(e['result']['follow'])
        self.assertNotIn('marks', e['result'])
        self.assertIn(f"recite-tests/tester1/{ready['take']}.json", self.stored)

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
    """Check is paid (apply-support.md): with the gate on, /check and /live without follow need the entitlement;
    Recite (follow) doesn't. tester1 has Check, tester2 doesn't."""

    def test_off_by_default(self):
        self.assertFalse(server.CHECK_GATE)
        r = self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer other'})
        self.assertEqual(r.status_code, 200)

    def test_check_needs_the_entitlement(self):
        with mock.patch.object(server, 'CHECK_GATE', True):
            r = self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer other'})
            self.assertEqual((r.status_code, r.json()), (403, {'error': 'check_locked'}))
            r = self.client.post('/check?s=1&a=1', content=wav(), headers={'Authorization': 'Bearer good'})
            self.assertEqual(r.status_code, 200)

    def test_live_check_needs_it_recite_does_not(self):
        with mock.patch.object(server, 'CHECK_GATE', True):
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(token='other'))
                self.assertEqual(ws.receive_json(), {'type': 'error', 'reason': 'check_locked'})
            for extra in ({'follow': True}, {'mode': 'recite'}):
                with self.client.websocket_connect('/live') as ws:
                    ws.send_text(start(token='other', **extra))
                    self.assertEqual(ws.receive_json()['type'], 'ready')
            with self.client.websocket_connect('/live') as ws:
                ws.send_text(start(token='good'))
                self.assertEqual(ws.receive_json()['type'], 'ready')


class EntitlementTests(unittest.TestCase):
    """auth.has_check reads entitlements/{uid}.check over Firestore REST."""

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
        answers = {'nobody': R(404), 'granted': R(200, {'fields': {'check': {'mapValue': {'fields': {
            'source': {'stringValue': 'dev'}, 'until': {'nullValue': None}}}}}}), 'empty': R(200, {})}
        calls = []

        def get(url, headers, timeout):
            calls.append(url)
            return answers[url.split('/entitlements/')[1].split('?')[0]]
        auth._checks.clear()
        with mock.patch.object(auth.requests, 'get', get), mock.patch.object(auth, 'token', lambda: 'x'):
            self.assertFalse(auth.has_check('nobody', now=100))
            self.assertTrue(auth.has_check('granted', now=100))
            self.assertFalse(auth.has_check('empty', now=100))
            self.assertTrue(auth.has_check('granted', now=150))  # cached
            self.assertEqual(len(calls), 3)
            self.assertTrue(auth.has_check('granted', now=100 + auth.CHECK_TTL + 1))  # read again
            self.assertEqual(len(calls), 4)
            self.assertIn('mask.fieldPaths=check', calls[0])
        auth._checks.clear()


if __name__ == '__main__':
    unittest.main()
