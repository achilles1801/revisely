"""Keeping a recitation as test data: only when the app asks (the account's switch is on), in revisely-dev Storage
under recite-tests/<uid>/, which no client can read or write (storage.rules). The lab's fetch_takes.py copies them
to the Mac. Nobody listens to them: they are checked by the lab's scripts only."""
import datetime
import os
import re
import secrets
import urllib.parse

import requests

import auth

BUCKET = os.environ.get('BUCKET', 'revisely-dev.firebasestorage.app')
PREFIX = 'recite-tests'


TAKE = re.compile(r'^\d{8}-\d{6}-[0-9a-f]{6}$')  # a take's name, as the app sees it


def new_take():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
    return f'{stamp}-{secrets.token_hex(3)}'


def name_for(uid, take=None):
    """recite-tests/<uid>/<take> (a new take when none is given): add .wav, .json, ..."""
    return f'{PREFIX}/{uid}/{take or new_take()}'


class Exists(Exception):
    """The name is taken: names are written once (ifGenerationMatch=0). It doesn't carry the name, which holds the
    uid: a dropped take's Exists is logged."""


def put(name, data, content_type):
    """Failures are auth.Unreachable or Exists, neither naming the object."""
    url = (f'https://storage.googleapis.com/upload/storage/v1/b/{BUCKET}/o?uploadType=media'
           f'&name={urllib.parse.quote(name, safe="")}&ifGenerationMatch=0')
    r = auth.call(requests.post, url, fine=(412,), data=data, timeout=60,
                  headers={'Authorization': f'Bearer {auth.token()}', 'Content-Type': content_type})
    if r.status_code == 412:
        raise Exists()
