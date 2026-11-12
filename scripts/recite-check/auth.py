"""Who is asking: a Firebase ID token for this project, and the account's previewTester flag (read from Firestore
with the service's own identity; clients can't write that field)."""
import os
import threading
import time

import cachecontrol
import google.auth
import google.auth.transport.requests
import requests
from google.oauth2 import id_token

PROJECT = os.environ.get('PROJECT', 'revisely-dev')
_session = cachecontrol.CacheControl(requests.session())  # Google's signing keys, cached as their headers say
_request = google.auth.transport.requests.Request(session=_session)
_creds = None
_lock = threading.Lock()
_testers = {}  # uid -> (is a tester, when read)
TESTER_TTL = 600


class Refused(Exception):
    def __init__(self, status, reason):
        super().__init__(reason)
        self.status = status
        self.reason = reason


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
    r = requests.get(url, headers={'Authorization': f'Bearer {token()}'}, timeout=10)
    if r.status_code == 404:
        ok = False
    else:
        r.raise_for_status()
        ok = r.json().get('fields', {}).get('previewTester', {}).get('booleanValue') is True
    _testers[uid] = (ok, time.time())
    return ok


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
