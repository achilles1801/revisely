"""Who is asking: a Firebase ID token for this project, and the account's previewTester flag (read from Firestore
with the service's own identity; clients can't write that field)."""
import datetime
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
_checks = {}  # uid -> (has Check, when read)
CHECK_TTL = 60  # a grant (or a revocation) takes effect within a minute
# The entitlements/{uid} field that unlocks Check (apply-support.md draft 2: `premium`, Check being a Premium feature;
# draft 1 had `check`). Present, and `until` null or later; the `grants` map beside it is the writers' bookkeeping.
ENTITLEMENT = os.environ.get('ENTITLEMENT', 'premium')


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


def has_check(uid, now=None):
    """Whether the account may use Check (apply-support.md: Has Premium): entitlements/{uid}.<ENTITLEMENT> exists and
    its `until` is null or later than now. Written only by the admin SDK (an approved application, devGrantPremium, later
    a purchase); any source counts. Read with the service's own identity, as previewTester is."""
    hit = _checks.get(uid)
    t = time.time() if now is None else now
    if hit and t - hit[1] < CHECK_TTL:
        return hit[0]
    url = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/entitlements/{uid}'
           f'?mask.fieldPaths={ENTITLEMENT}')
    r = requests.get(url, headers={'Authorization': f'Bearer {token()}'}, timeout=10)
    if r.status_code == 404:
        ok = False
    else:
        r.raise_for_status()
        ok = check_open(r.json().get('fields', {}).get(ENTITLEMENT), t)
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
