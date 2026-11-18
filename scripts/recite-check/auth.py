"""Who is asking: a Firebase ID token for this project, and the account's previewTester flag (read from Firestore
with the service's own identity; clients can't write that field)."""
import base64
import datetime
import json
import os
import threading
import time

import cachecontrol
import google.auth
import google.auth.jwt
import google.auth.transport.requests
import requests
import rsa
from google.oauth2 import id_token

PROJECT = os.environ.get('PROJECT', 'revisely-dev')
_session = cachecontrol.CacheControl(requests.session())  # Google's signing keys, cached as their headers say
_request = google.auth.transport.requests.Request(session=_session)
_creds = None
_lock = threading.Lock()
_testers = {}  # uid -> (is a tester, when read)
TESTER_TTL = 600
_checks = {}  # uid -> (has Check, when read)
# A yes is kept 10 minutes: early access is for life and Open Door grants have no end date, so only a revocation waits
# that long; and from europe-west1 each read of production's Firestore (nam5) takes 0.25–0.8 s (Nov 18 2026).
CHECK_TTL = int(os.environ.get('CHECK_TTL', 600))
CHECK_TTL_NO = 10  # a no is trusted for less: a grant written just after sign-up (early access) unlocks within seconds
# The entitlements/{uid} field that unlocks Check (apply-support.md draft 2: `premium`, Check being a Premium feature;
# draft 1 had `check`). Present, and `until` null or later; the `grants` map beside it is the writers' bookkeeping.
ENTITLEMENT = os.environ.get('ENTITLEMENT', 'premium')


class Refused(Exception):
    def __init__(self, status, reason):
        super().__init__(reason)
        self.status = status
        self.reason = reason


class Unreachable(Exception):
    """Firestore or Storage refused, or couldn't be reached. It says only how (a status, or the kind of error):
    requests puts the URL in its own errors, and these URLs hold the account's uid, which never goes in a log."""


_local = threading.local()


def _read(url, **kw):
    """A GET on this thread's own kept-alive connection, for the Firestore reads: a new connection each time added its
    handshake to every read. requests.Session isn't promised to be thread-safe, so each worker thread has its own."""
    s = getattr(_local, 'session', None)
    if s is None:
        s = _local.session = requests.Session()
    return s.get(url, **kw)


def call(fn, url, fine=(), **kw):
    """fn(url, **kw) (requests.get or requests.post): the response, when it is below 400 or its status is in `fine`;
    otherwise Unreachable, which names no URL."""
    try:
        r = fn(url, **kw)
    except requests.RequestException as e:
        raise Unreachable(type(e).__name__) from None
    if r.status_code >= 400 and r.status_code not in fine:
        raise Unreachable(f'HTTP {r.status_code}')
    return r


def uid_of(header):
    """The signed-in account's uid, or Refused(401)."""
    if not header or not header.startswith('Bearer '):
        raise Refused(401, 'sign_in')
    try:
        claims = id_token.verify_firebase_token(header[7:], _request, audience=PROJECT)
    except Exception:
        raise Refused(401, 'sign_in')
    uid = claims.get('sub') or claims.get('user_id')
    if not uid or claims.get('iss') != f'https://securetoken.google.com/{PROJECT}':
        raise Refused(401, 'sign_in')
    return uid


def token():
    """An access token for the service's own account (Firestore, Storage)."""
    global _creds
    with _lock:
        if _creds is None:
            _creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
        if not _creds.valid:
            _creds.refresh(google.auth.transport.requests.Request())
        return _creds.token


def is_tester(uid):
    hit = _testers.get(uid)
    if hit and time.time() - hit[1] < TESTER_TTL:
        return hit[0]
    url = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/users/{uid}'
           '?mask.fieldPaths=previewTester')
    r = call(_read, url, fine=(404,), headers={'Authorization': f'Bearer {token()}'}, timeout=10)
    ok = r.status_code != 404 and r.json().get('fields', {}).get('previewTester', {}).get('booleanValue') is True
    _testers[uid] = (ok, time.time())
    return ok


def has_check(uid, now=None):
    """Whether the account may use Check (apply-support.md: Has Premium): entitlements/{uid}.<ENTITLEMENT> exists and
    its `until` is null or later than now. Written only by the admin SDK (an approved application, devGrantPremium, later
    a purchase); any source counts. Read with the service's own identity, as previewTester is."""
    hit = _checks.get(uid)
    t = time.time() if now is None else now
    if hit and t - hit[1] < (CHECK_TTL if hit[0] else CHECK_TTL_NO):
        return hit[0]
    url = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/entitlements/{uid}'
           f'?mask.fieldPaths={ENTITLEMENT}')
    r = call(_read, url, fine=(404,), headers={'Authorization': f'Bearer {token()}'}, timeout=10)
    ok = r.status_code != 404 and check_open(r.json().get('fields', {}).get(ENTITLEMENT), t)
    _checks[uid] = (ok, t)
    return ok


def check_open(field, now):
    """A Firestore REST entitlement map: present, and `until` absent, null or after now."""
    if not field or 'mapValue' not in field:
        return False
    until = field['mapValue'].get('fields', {}).get('until')
    if until is None or 'nullValue' in until:
        return True
    ts = until.get('timestampValue')
    if not ts:
        return False
    try:
        when = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()
    except ValueError:
        return False
    return when > now


# ------------------------------------------------------------------ App Check

APP_CHECK_JWKS = 'https://firebaseappcheck.googleapis.com/v1/jwks'
APP_CHECK_KEYS_TTL = 6 * 3600  # Firebase: cache the keys no longer than 6 hours
APP_CHECK_REFETCH = 60         # an unknown key id fetches the keys again, at most once a minute
_jwks = {'keys': {}, 'at': None, 'tried': None}  # kid -> PEM; when fetched; when last tried
_jwks_lock = threading.Lock()


def b64url(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def pem_of(jwk):
    """An RSA JWK (n, e) as a PKCS#1 PEM public key, which google-auth's verifier reads."""
    n = int.from_bytes(b64url(jwk['n']), 'big')
    e = int.from_bytes(b64url(jwk['e']), 'big')
    return rsa.PublicKey(n, e).save_pkcs1().decode()


def app_check_keys(kid, now):
    """App Check's public keys {kid: PEM}, fetched when older than 6 hours or when `kid` is new to us."""
    with _jwks_lock:
        fresh = _jwks['at'] is not None and now - _jwks['at'] < APP_CHECK_KEYS_TTL
        recently = _jwks['tried'] is not None and now - _jwks['tried'] < APP_CHECK_REFETCH
        if (not fresh or kid not in _jwks['keys']) and not recently:
            _jwks['tried'] = now
            try:
                r = call(requests.get, APP_CHECK_JWKS, timeout=10)
                keys = {k['kid']: pem_of(k) for k in r.json().get('keys', [])
                        if k.get('kty') == 'RSA' and k.get('kid') and k.get('n') and k.get('e')}
            except (Unreachable, ValueError, KeyError, TypeError):
                if not _jwks['keys']:
                    raise Unreachable('App Check keys') from None
                keys = None  # keep the keys we have: a short outage at Google doesn't refuse everyone
            if keys:
                _jwks['keys'], _jwks['at'] = keys, now
        return dict(_jwks['keys'])


def app_check(token, project_number, now=None):
    """'ok', 'missing' or 'bad': whether `token` is a Firebase App Check token for this project (the project's number),
    signed by App Check (RS256, its published keys), from App Check, for this project, and not expired. The token's
    subject (the app id) isn't needed: any of the project's registered apps may call. Keys that can't be fetched are
    Unreachable, never 'bad': the caller decides what that means."""
    if not token:
        return 'missing'
    if not isinstance(token, str) or len(token) > 8192 or token.count('.') != 2:
        return 'bad'
    t = time.time() if now is None else now
    try:
        header = json.loads(b64url(token.split('.')[0]))
    except (ValueError, TypeError):
        return 'bad'
    if not isinstance(header, dict) or header.get('alg') != 'RS256' or header.get('typ') != 'JWT' \
            or not isinstance(header.get('kid'), str):
        return 'bad'
    keys = app_check_keys(header['kid'], t)
    if header['kid'] not in keys:
        return 'bad'
    try:
        claims = google.auth.jwt.decode(token, certs={header['kid']: keys[header['kid']]}, verify=True,
                                        clock_skew_in_seconds=10)
    except Exception:
        return 'bad'
    aud = claims.get('aud')
    aud = aud if isinstance(aud, list) else [aud]
    if claims.get('iss') != f'https://firebaseappcheck.googleapis.com/{project_number}' \
            or f'projects/{project_number}' not in aud:
        return 'bad'
    return 'ok'


class Limiter:
    """At most `n` checks an hour per account (on this instance; there are at most two)."""

    def __init__(self, n=40):
        self.n = n
        self.seen = {}

    def take(self, uid):
        now = time.time()
        recent = [t for t in self.seen.get(uid, []) if now - t < 3600]
        if len(recent) >= self.n:
            raise Refused(429, 'limit')
        recent.append(now)
        self.seen[uid] = recent
