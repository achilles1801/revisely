"""The recitation check service (Cloud Run, revisely-dev only). See README.md.

POST /check?s=&a=[&s2=&a2=][&mon=&mot=&aar=][&letters=1][&keep=1][&v=2]  body: WAV, 16 kHz mono 16-bit
  Authorization: Bearer <Firebase ID token of a previewTester account on revisely-dev>
POST /dismiss  {"take": "...", "id": "..."}  (same sign-in): "Not a mistake", kept next to the take
WS   /live     the live check: a start frame (the token in it or in the Authorization header), then PCM; events
               back (README.md, "Live"; the notes folder's recite-contract.md)
GET  /health
"""
import asyncio
import contextlib
import inspect
import io
import json
import logging
import os
import pathlib
import re
import threading
import time
import wave

import numpy as np
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

import auth
import live
import store
from engine import BadRequest, Engine

HERE = pathlib.Path(__file__).resolve().parent
VERSION = (HERE / 'CHECKER_COMMIT').read_text().strip()[:12] if (HERE / 'CHECKER_COMMIT').exists() else 'local'
SERVER = (HERE / 'SERVER_COMMIT').read_text().strip()[:12] if (HERE / 'SERVER_COMMIT').exists() else 'local'
PROTOCOL = 6  # the contract this server speaks (recite-contract.md): 5 = follow, hint, tajweed, premium_required;
              # 6 = start anywhere on the page (startBy, locked, nolock, done.result.start); see protocol()
MAX_SECONDS = 240
FIRST_FRAME = 10      # seconds a new socket has to send its start frame
IDLE = 30             # seconds without a frame from the phone before a socket is closed
RESUME_TTL = 120      # seconds a dropped session waits on this instance for its phone to come back (and a
                      # finished take's `done` is kept for a resume that missed it)
# Check is a Premium feature, with a free path (apply-support.md draft 2): with CHECK_GATE=on, /check and /live without
# "follow" need entitlements/{uid}.premium (auth.has_check); Recite (follow) stays free. Off until a dev account has it.
CHECK_GATE = os.environ.get('CHECK_GATE', 'off') == 'on'
LOCKED = 'premium_required'  # the refusal without Premium (agreed with apply-support and recite-ui; was check_locked)
# A live take with no end (no s2/a2, as the app sends it) follows the reciter to the end of the Qur'an, and the reciter
# decides where to stop (`end`): with the surah's end, the follow stopped there, so a take running on into the next
# surah (An-Naba into An-Nazi'at) lost its cursor. A passage costs nothing until it is reached (live.py works 96 words
# at a time), and the checker takes the basmala before a surah inside the passage as a filler. /check (record, then
# check) keeps the surah as its default: it aligns the whole recording to the passage at once.
LAST_AYAH = (114, 6)
# Start anywhere on the page (Majd, Nov 14 2026; protocol 6): `startBy` [sura, ayah] is the page's last ayah, and the
# reciter begins at some word from s:a's first through its end. The follower (live.py) searches for the start, sends
# `locked` (or `nolock`) and goes on from there. A start frame without it is protocol 5's: the take starts at s:a.
START_BY_WORDS = 400  # the most words from s:a's first word to startBy's end: a foldable's two pages
MARK_ID = re.compile(r'^\d{1,6}:(word|letter|tajweed):[a-z_]{1,24}$')
log = logging.getLogger('recite-check')
logging.basicConfig(level=logging.INFO)
ENGINE = {}
limiter = auth.Limiter()


@contextlib.asynccontextmanager
async def lifespan(_app):
    # Loaded before the port opens: Cloud Run gives a starting instance its CPU until then.
    ENGINE['e'] = Engine(threads=int(os.environ.get('THREADS', '2')))
    # The helper works out a live session's next words; with the word table in the image there is nothing for it to
    # do, and starting it (a second Python importing the checker) costs seconds of a cold start on Cloud Run.
    if ENGINE['e'].table is None and os.environ.get('LIVE_HELPER', '1') == '1':
        live.start_helper()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def read_wav(body):
    try:
        w = wave.open(io.BytesIO(body))
    except Exception:
        raise BadRequest('not a WAV file')
    if w.getnchannels() != 1 or w.getsampwidth() != 2 or w.getframerate() != 16000:
        raise BadRequest('WAV must be 16 kHz mono 16-bit')
    n = w.getnframes()
    if n > MAX_SECONDS * 16000:
        raise BadRequest('too long')
    return np.frombuffer(w.readframes(n), '<i2').astype(np.float32) / 32768.0


def wav_bytes(pcm):
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm.astype('<i2').tobytes())
    return buf.getvalue()


def num(q, k):
    v = q.get(k)
    if v is None or v == '':
        return None
    try:
        return int(v)
    except ValueError:
        raise BadRequest(f'{k} must be a number')


def passage_of(s, a, s2, a2):
    if s is None or a is None or (s2 is None) != (a2 is None):
        raise BadRequest('s and a (and both or neither of s2, a2) are needed')
    return s, a, s2, a2


async def signed_in_tester(header):
    uid = await asyncio.to_thread(auth.uid_of, header)
    if not await asyncio.to_thread(auth.is_tester, uid):
        raise auth.Refused(403, 'testers_only')
    return uid


async def may_check(uid):
    """Check (marks) needs the entitlement when the gate is on; Recite doesn't."""
    if CHECK_GATE and not await asyncio.to_thread(auth.has_check, uid):
        raise auth.Refused(403, LOCKED)


def put_json(name, obj):
    store.put(name, json.dumps(obj, ensure_ascii=False).encode(), 'application/json')


@app.get('/health')
def health():
    """engine: the checker's commit; server: this service's (the repo's commit it was staged from); protocol: the
    contract draft it speaks, so the app can tell which features it may use; words: whether the word table for this
    checker is in the image. Without it a cold instance works out every word it needs (~100 ms each), and finding
    where a take starts needs a whole page at once: 27–38 s hops on rev 00043. Traffic never moves to a revision that
    says false (README, "The word table")."""
    return {'ok': True, 'engine': VERSION, 'server': SERVER, 'protocol': protocol(),
            'words': ENGINE['e'].table is not None}


@app.post('/check')
async def check(request: Request):
    try:
        uid = await signed_in_tester(request.headers.get('authorization'))
        await may_check(uid)
        limiter.take(uid)
        body = await request.body()
        if len(body) > MAX_SECONDS * 32000 + 4096:
            raise BadRequest('too long')
        x = read_wav(body)
        q = request.query_params
        s, a, s2, a2 = passage_of(num(q, 's'), num(q, 'a'), num(q, 's2'), num(q, 'a2'))
        v2 = q.get('v') == '2'
        keep = q.get('keep') == '1'
        take = store.new_take() if keep else None
        name = store.name_for(uid, take) if keep else None
        upload = asyncio.create_task(asyncio.to_thread(store.put, name + '.wav', body, 'audio/wav')) if keep else None
        e = ENGINE['e']
        res = await asyncio.to_thread(e.check, x, s, a, s2, a2, dict(q), 2 if v2 else 1)
        res['engine'] = VERSION
        if keep:
            try:
                await upload
                meta = {'request': {k: q[k] for k in q}, 'app': request.headers.get('x-revisely-app'), 'result': res}
                await asyncio.to_thread(put_json, name + '.json', meta)
                res['kept'] = True
                if v2:
                    res['take'] = take
            except Exception:
                log.exception('keeping the take failed')
                res['kept'] = False
        if v2:
            log.info('check v2: %.1f s audio, %s words reached, %d marks, ms %s, kept %s',
                     res['secs'], res['score']['reached'], len(res['marks']), res['ms'], res.get('kept'))
        else:
            flags = sum(1 for w in res['words'] if w['status'] in ('wrong', 'missed')) + len(res['extras'])
            log.info('check: %.1f s audio, %d words said, %d word flags, %d tajweed, ms %s, kept %s',
                     res['secs'], len(res['words']), flags, len(res['tajweed']), res['ms'], res.get('kept'))
        return JSONResponse(res)
    except auth.Refused as e:
        return JSONResponse({'error': e.reason}, status_code=e.status)
    except BadRequest as e:
        return JSONResponse({'error': 'bad_request', 'detail': str(e)}, status_code=400)
    except Exception:
        log.exception('check failed')
        return JSONResponse({'error': 'server'}, status_code=500)


@app.post('/dismiss')
async def dismiss(request: Request):
    """The person said a mark was not a mistake: a label for the lab, kept next to the take (only kept takes)."""
    try:
        uid = await signed_in_tester(request.headers.get('authorization'))
        try:
            body = json.loads(await request.body())
        except ValueError:
            raise BadRequest('JSON body needed')
        take, mid = body.get('take'), body.get('id')
        if not isinstance(take, str) or not store.TAKE.match(take) or not isinstance(mid, str) \
                or not MARK_ID.match(mid):
            raise BadRequest('take and id are needed')
        name = f'{store.name_for(uid, take)}.dismiss-{store.new_take()}.json'
        await asyncio.to_thread(put_json, name, {'take': take, 'id': mid, 'at': time.time()})
        return JSONResponse({'ok': True})
    except auth.Refused as e:
        return JSONResponse({'error': e.reason}, status_code=e.status)
    except BadRequest as e:
        return JSONResponse({'error': 'bad_request', 'detail': str(e)}, status_code=400)
    except Exception:
        log.exception('dismiss failed')
        return JSONResponse({'error': 'server'}, status_code=500)


# ------------------------------------------------------------ live

class Live:
    """A live session on this instance: its checker, who it belongs to, and what to keep."""

    def __init__(self, sid, uid, sess, keep, request, app_version):
        self.sid, self.uid, self.sess, self.keep = sid, uid, sess, keep
        self.request, self.app = request, app_version
        self.events = []      # every event sent, for the kept take
        self.owner = None     # the socket feeding it now
        self.left = None      # when its last socket went
        self.sockets = 0
        self.lock = threading.Lock()  # one socket's work at a time

    def run(self, fn, *args):
        with self.lock:
            return fn(*args)


SESSIONS = {}
FINISHED = {}  # take -> (uid, samples held, its `done`, when): a resume after the end gets the same `done` again


def forget_old():
    now = time.time()
    for sid, s in list(SESSIONS.items()):
        if s.owner is None and s.left is not None and now - s.left > RESUME_TTL:
            del SESSIONS[sid]
    for sid, f in list(FINISHED.items()):
        if now - f[3] > RESUME_TTL:
            del FINISHED[sid]


def keep_take(s, partial=False):
    """The audio, the events and the dismissals (and the end result) under recite-tests/<uid>/<take>; a dropped
    session's so far under <take>.part-<time> (names are written once, and another instance may finish it). A take
    already kept under its name (finished before, then resumed and run again, maybe on the other instance) is left as
    it is: the run is the same audio, so the same events."""
    name = store.name_for(s.uid, s.sid) + (f'.part-{store.new_take()}' if partial else '')
    sess = s.sess
    for suffix, write in (('.wav', lambda n: store.put(n, wav_bytes(sess.pcm[:sess.n]), 'audio/wav')),
                          ('.json', lambda n: put_json(n, {
                              'mode': 'live', 'request': s.request, 'app': s.app, 'engine': VERSION,
                              'events': s.events, 'dismissed': sorted(sess.dismissed), 'hints': sess.hints,
                              'result': sess.result, 'secs': round(sess.seconds, 1)}))):
        try:
            write(name + suffix)
        except store.Exists:
            if partial:
                raise
            log.info('live: take already kept (%s)', suffix)


def settings_from(msg):
    """mon, mot, aar, letters and tajweed from the start frame (flat, as the contract has them; or in 'settings')."""
    raw = msg.get('settings') if isinstance(msg.get('settings'), dict) else msg
    out = {k: raw[k] for k in ('mon', 'mot', 'aar') if isinstance(raw.get(k), int) and not isinstance(raw[k], bool)}
    out['letters'] = '1' if raw.get('letters') is True else '0'
    out['tajweed'] = '0' if raw.get('tajweed') is False else '1'
    return out


def start_by_of(msg, s, a, end):
    """The start frame's `startBy` as (sura, ayah), or None without it. Refused (bad_request) unless it is [sura,
    ayah] of an ayah from s:a to the passage's end (s2:a2, or the Qur'an's) and at most START_BY_WORDS words from
    s:a's first word."""
    sb = msg.get('startBy')
    if sb is None:
        return None
    sb = ayah_pair(sb)
    if sb is None:
        raise BadRequest('startBy must be [sura, ayah]')
    if sb < (s, a) or sb > end:
        raise BadRequest('startBy must be an ayah from s:a to the end of the passage')
    lo, hi = ENGINE['e'].passage(s, a, *sb, max_words=10 ** 6)
    if hi - lo > START_BY_WORDS:
        raise BadRequest(f'from s:a to startBy is more than {START_BY_WORDS} words')
    return sb


def protocol():
    """PROTOCOL once the follower can start anywhere on the page (live.LiveSession takes start_by), else 5, with
    startBy ignored as a protocol 5 server ignores it: whichever of the server and the follower is deployed first, the
    phone is never told to wait for a `locked` that can't come."""
    ps = inspect.signature(live.LiveSession).parameters
    return PROTOCOL if 'start_by' in ps or any(p.kind is p.VAR_KEYWORD for p in ps.values()) else 5


def start_note(s):
    """How a take started, for the log, in numbers only (never the word or ayah): '-' for a start at s:a; with startBy,
    when the first `locked` came (seconds of audio) and how many came, or that none did (no lock means silence: the
    phone is told nothing, Majd, Nov 14 2026)."""
    if 'startBy' not in s.request:
        return '-'
    locks = [e.get('t') for e in s.events if e.get('type') == 'locked']
    return f'locked at {locks[0]} s ({len(locks)} locks)' if locks else f'no lock in {s.sess.seconds:.1f} s'


def ayah_pair(v):
    """[sura, ayah] (two whole numbers) as a tuple, or None."""
    if isinstance(v, (list, tuple)) and len(v) == 2 and all(isinstance(x, int) and not isinstance(x, bool) for x in v):
        return tuple(v)
    return None


def control_of(c):
    """A text frame from the phone after the start, as the session takes it, or None to ignore it. A `seek` may
    carry `startBy` (protocol 6: the reciter is somewhere from w through that ayah, so the follower searches again);
    as a tuple, or the frame is dropped when it isn't [sura, ayah]. The session checks the range itself."""
    if not isinstance(c, dict) or c.get('type') not in ('seek', 'dismiss', 'hint', 'end', 'stop'):
        return None
    if c['type'] == 'seek' and 'startBy' in c:
        sb = ayah_pair(c['startBy'])
        if sb is None:
            return None
        c = dict(c, startBy=sb) if protocol() >= 6 else {k: v for k, v in c.items() if k != 'startBy'}
    return c


def follow_of(msg):
    """Recite (follow along only): "follow": true (contract draft 5), or the app's "mode": "recite"."""
    return msg.get('follow') is True or msg.get('mode') == 'recite'


def int_or_none(msg, k):
    v = msg.get(k)
    if v is None:
        return None
    if not isinstance(v, int) or isinstance(v, bool):
        raise BadRequest(f'{k} must be a number')
    return v


async def open_session(msg, uid):
    """The session a start frame asks for: the one it resumes if this instance still has it, else a new one (a
    resume this instance doesn't have starts again from the first sample, under the same take name)."""
    forget_old()
    rid = msg.get('resume')
    s = SESSIONS.get(rid) if isinstance(rid, str) else None
    if s and s.uid == uid and not s.sess.stopped:
        return s, True
    if not rid:
        limiter.take(uid)
    passage = passage_of(*(int_or_none(msg, k) for k in ('s', 'a', 's2', 'a2')))
    settings = settings_from(msg)
    follow = follow_of(msg)
    open_end = passage[2] is None
    run = passage[:2] + LAST_AYAH if open_end else passage
    start_by = start_by_of(msg, *passage[:2], run[2:]) if protocol() >= 6 else None
    # defer: each ayah's letters and tajweed are judged off the hop, so they never hold up the cursor (live.py)
    sess = await asyncio.to_thread(live.LiveSession, ENGINE['e'], *run, settings, follow, defer=True,
                                   open_end=open_end, **({'start_by': start_by} if start_by else {}))
    sid = rid if isinstance(rid, str) and store.TAKE.match(rid) else store.new_take()
    request = dict(zip(('s', 'a', 's2', 'a2'), passage), settings=settings, follow=follow, open=open_end)
    if start_by:
        request['startBy'] = list(start_by)
    s = Live(sid, uid, sess, msg.get('keep') is True, request, msg.get('app') if isinstance(msg.get('app'), str)
             else None)
    SESSIONS[sid] = s
    return s, False


async def read_into(ws, inbox):
    """Every frame from the phone into the inbox as it comes: ('audio', bytes), ('control', msg), then ('gone', None),
    or ('idle', None) after IDLE seconds without a frame."""
    try:
        while True:
            try:
                m = await asyncio.wait_for(ws.receive(), IDLE)
            except asyncio.TimeoutError:
                await inbox.put(('idle', None))
                return
            if m['type'] == 'websocket.disconnect':
                break
            if m.get('bytes') is not None:
                await inbox.put(('audio', m['bytes']))
            elif m.get('text') is not None:
                try:
                    c = json.loads(m['text'])
                except ValueError:
                    continue
                c = control_of(c)
                if c is not None:
                    await inbox.put(('control', c))  # anything else is ignored
    except Exception:
        pass
    await inbox.put(('gone', None))


@app.websocket('/live')
async def live_socket(ws: WebSocket):
    await ws.accept()
    me = object()
    s = None

    async def send(events, record=True):
        for e in events:
            if record and s is not None and e['type'] != 'ready':
                s.events.append(e)
            try:
                await ws.send_text(json.dumps(e, ensure_ascii=False))
            except (RuntimeError, OSError) as x:  # the phone closed first (uvicorn: "websocket.send after close")
                raise WebSocketDisconnect(1006) from x

    async def fail(reason, code=1008):
        with contextlib.suppress(Exception):
            await ws.send_text(json.dumps({'type': 'error', 'reason': reason}))
            await ws.close(code)

    async def finish(events):
        """The take is over: send the rest with `done` at once, then keep the take (when asked) and say so with
        `kept`, and close. The phone has its answer without waiting for the upload; the socket stays open for it."""
        SESSIONS.pop(s.sid, None)
        r = s.sess.result
        r.update(engine=VERSION, take=s.sid)
        done = next((e for e in events if e['type'] == 'done'), None)
        FINISHED[s.sid] = (s.uid, s.sess.n, done, time.time())
        s.events += [e for e in events if e['type'] != 'done']  # the result is kept on its own
        log.info('live: %.1f s audio, %s words reached, %d marks, why %s, ms %s, sockets %d, keep %s, start %s',
                 s.sess.seconds, (r.get('score') or {}).get('reached', len(r.get('words') or [])),
                 len(r.get('marks') or []), r.get('why'), r.get('ms'), s.sockets, s.keep, start_note(s))
        with contextlib.suppress(WebSocketDisconnect):
            await send(events, record=False)
        if s.keep:
            t0 = time.perf_counter()
            job = asyncio.ensure_future(asyncio.to_thread(keep_take, s))  # shielded: it finishes if the phone goes
            job.add_done_callback(lambda j: j.cancelled() or j.exception() is None
                                  or log.error('keeping the live take failed: %r', j.exception()))
            ok = True
            try:
                await asyncio.shield(job)
            except asyncio.CancelledError:
                raise
            except Exception:
                ok = False
            log.info('live: kept in %d ms (%s)', (time.perf_counter() - t0) * 1000, 'ok' if ok else 'failed')
            with contextlib.suppress(Exception):
                await send([{'type': 'kept', 'take': s.sid, 'ok': ok, 't': round(s.sess.seconds, 2)}], record=False)
        with contextlib.suppress(Exception):
            await ws.close(1000)

    try:
        try:
            first = await asyncio.wait_for(ws.receive_text(), FIRST_FRAME)
            msg = json.loads(first)
        except (asyncio.TimeoutError, ValueError, KeyError):
            raise BadRequest('the first frame must be a start frame')
        if not isinstance(msg, dict) or msg.get('type') != 'start':
            raise BadRequest('the first frame must be a start frame')
        token = msg.get('token')
        uid = await signed_in_tester('Bearer ' + token if isinstance(token, str) else ws.headers.get('authorization'))
        if not follow_of(msg):
            await may_check(uid)  # on every socket, a resume's too
        forget_old()
        rid = msg.get('resume')
        f = FINISHED.get(rid) if isinstance(rid, str) else None
        if f and f[0] == uid and f[2] is not None:
            # the take ended on this instance and the phone missed its `done`: the same answer again, not a re-run
            await send([{'type': 'ready', 'v': 2, 'engine': VERSION, 'server': SERVER, 'protocol': protocol(),
                         'take': rid, 'from': f[1]}, f[2]], record=False)
            with contextlib.suppress(Exception):
                await ws.close(1000)
            return
        s, resumed = await open_session(msg, uid)

        def take_over():
            # under the session's lock: a socket that dropped may still be checking its last piece of audio, and
            # `from` must not move after it is sent
            with s.lock:
                s.owner, s.left = me, None
                return s.sess.n, s.sess.snapshot() if resumed else []
        held, snap = await asyncio.to_thread(take_over)
        s.sockets += 1
        await send([{'type': 'ready', 'v': 2, 'engine': VERSION, 'server': SERVER, 'protocol': protocol(),
                     'take': s.sid, 'from': held}], record=False)
        await send(snap, record=False)  # what the dropped socket may have swallowed
        # A reader drains the socket at once into a queue and the work runs from the queue, in order: a phone
        # resending a take (a resume) sends faster than it is checked, and a socket left unread stops answering
        # pings, which ends the connection.
        inbox = asyncio.Queue()
        reader = asyncio.create_task(read_into(ws, inbox))
        held = None  # a frame taken while gathering audio, to handle next
        try:
            while True:
                kind, item = held or await inbox.get()
                held = None
                if kind == 'idle':
                    await fail('idle', 1000)
                    break
                if kind == 'gone' or s.owner is not me:  # gone, or the phone came back on another socket
                    break
                if kind == 'audio':  # this and any audio queued right behind it, in one go
                    chunks = [item]
                    while not inbox.empty():
                        nxt = inbox.get_nowait()
                        if nxt[0] != 'audio':
                            held = nxt
                            break
                        chunks.append(nxt[1])
                    events = await asyncio.to_thread(s.run, s.sess.feed, b''.join(chunks))
                else:
                    events = await asyncio.to_thread(s.run, s.sess.control, item)
                if s.sess.stopped:
                    await finish(events)
                    break
                await send(events)
        finally:
            reader.cancel()
    except auth.Refused as e:
        await fail(e.reason)
    except BadRequest as e:
        log.info('live: bad request (%s)', e)
        await fail('bad_request')
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception('live failed')
        await fail('server', 1011)
    finally:
        if s is not None and s.owner is me:
            s.owner, s.left = None, time.time()
            if not s.sess.stopped and s.keep and s.sess.n >= 2 * live.SR:
                # dropped: keep what came, in case the phone never comes back (another instance may finish it).
                # Its own task, waited on but shielded: the upload finishes even if this handler is cancelled.
                job = asyncio.ensure_future(asyncio.to_thread(keep_take, s, True))
                job.add_done_callback(lambda j: j.cancelled() or j.exception() is None
                                      or log.error('keeping the dropped live take failed: %r', j.exception()))
                await asyncio.shield(job)
