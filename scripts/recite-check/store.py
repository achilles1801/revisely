"""Keeping a recitation as test data: only when the app asks (the account's switch is on), in revisely-dev Storage
under recite-tests/<uid>/, which no client can read or write (storage.rules). The lab's fetch_takes.py copies them
to the Mac. Nobody listens to them: they are checked by the lab's scripts only."""
import datetime
import os
import secrets
import urllib.parse

import requests

import auth

BUCKET = os.environ.get('BUCKET', 'revisely-dev.firebasestorage.app')
PREFIX = 'recite-tests'


def name_for(uid):
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
    return f'{PREFIX}/{uid}/{stamp}-{secrets.token_hex(3)}'


def put(name, data, content_type):
    url = (f'https://storage.googleapis.com/upload/storage/v1/b/{BUCKET}/o?uploadType=media'
           f'&name={urllib.parse.quote(name, safe="")}&ifGenerationMatch=0')
    r = requests.post(url, data=data, timeout=60,
                      headers={'Authorization': f'Bearer {auth.token()}', 'Content-Type': content_type})
    r.raise_for_status()
