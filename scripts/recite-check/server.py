"""The recitation check service (Cloud Run, revisely-dev only). See README.md.

POST /check?s=&a=[&s2=&a2=][&mon=&mot=&aar=][&letters=1][&keep=1]  body: WAV, 16 kHz mono 16-bit
  Authorization: Bearer <Firebase ID token of a previewTester account on revisely-dev>
GET /health
"""
import asyncio
import contextlib
import io
import json
import logging
import os
import pathlib
import wave

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import auth
import store
from engine import BadRequest, Engine

HERE = pathlib.Path(__file__).resolve().parent
VERSION = (HERE / 'CHECKER_COMMIT').read_text().strip()[:12] if (HERE / 'CHECKER_COMMIT').exists() else 'local'
MAX_SECONDS = 240
log = logging.getLogger('recite-check')
logging.basicConfig(level=logging.INFO)
ENGINE = {}
limiter = auth.Limiter()


@contextlib.asynccontextmanager
async def lifespan(_app):
    # Loaded before the port opens: Cloud Run gives a starting instance its CPU until then.
    ENGINE['e'] = Engine(threads=int(os.environ.get('THREADS', '2')))
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


def num(q, k):
    v = q.get(k)
    if v is None or v == '':
        return None
    try:
        return int(v)
    except ValueError:
        raise BadRequest(f'{k} must be a number')


@app.get('/health')
def health():
    return {'ok': True, 'engine': VERSION}


@app.post('/check')
async def check(request: Request):
    try:
        uid = auth.uid_of(request.headers.get('authorization'))
        if not await asyncio.to_thread(auth.is_tester, uid):
            raise auth.Refused(403, 'testers_only')
        limiter.take(uid)
        body = await request.body()
        if len(body) > MAX_SECONDS * 32000 + 4096:
            raise BadRequest('too long')
        x = read_wav(body)
        q = request.query_params
        s, a, s2, a2 = num(q, 's'), num(q, 'a'), num(q, 's2'), num(q, 'a2')
        if s is None or a is None or (s2 is None) != (a2 is None):
            raise BadRequest('s and a (and both or neither of s2, a2) are needed')
        keep = q.get('keep') == '1'
        name = store.name_for(uid) if keep else None
        upload = asyncio.create_task(asyncio.to_thread(store.put, name + '.wav', body, 'audio/wav')) if keep else None
        res = await asyncio.to_thread(ENGINE['e'].check, x, s, a, s2, a2, dict(q))
        res['engine'] = VERSION
        if keep:
            try:
                await upload
                meta = {'request': {k: q[k] for k in q}, 'app': request.headers.get('x-revisely-app'), 'result': res}
                await asyncio.to_thread(store.put, name + '.json', json.dumps(meta, ensure_ascii=False).encode(),
                                        'application/json')
                res['kept'] = True
            except Exception:
                log.exception('keeping the take failed')
                res['kept'] = False
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
