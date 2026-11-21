#!/usr/bin/env python3
"""Download volunteers' /record folders from the owner's Drive into the lab (data/record-raw/P../), through the Drive
API with gcloud's credentials (`gcloud auth login --enable-gdrive-access`). Only the folders named are read; the takes
stay on this Mac and no one listens to them. Each take's Drive description (its length, the passage chosen for n8, the
phone) is saved beside it as <take>.json, which record_bench.py reads.

  python record_fetch.py P41=<folder id> P44=<folder id>
"""
import json, os, pathlib, re, subprocess, sys, urllib.parse, urllib.request

OUT = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab')) / 'data/record-raw'


def token():
    env = dict(os.environ, CLOUDSDK_PYTHON=os.environ.get('CLOUDSDK_PYTHON', sys.executable))
    return subprocess.run(['gcloud', 'auth', 'print-access-token'], capture_output=True, text=True, env=env, check=True).stdout.strip()


def get(url, tok):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    tok = token()
    for arg in sys.argv[1:]:
        code, fid = arg.split('=', 1)
        assert re.fullmatch(r'P\d{2}', code)
        d = OUT / code; d.mkdir(parents=True, exist_ok=True)
        q = urllib.parse.quote(f"'{fid}' in parents and trashed=false")
        listing = json.loads(get(f'https://www.googleapis.com/drive/v3/files?q={q}&pageSize=200&fields=files(id,name,size,description)', tok))
        n = total = 0
        for f in listing['files']:
            name = f['name']
            if not re.fullmatch(r'(consent|profile)\.json|[a-z][a-z0-9]*_take\d+\.(m4a|webm|ogg|aac)', name):
                continue
            data = get(f"https://www.googleapis.com/drive/v3/files/{f['id']}?alt=media", tok)
            (d / name).write_bytes(data)
            if f.get('description') and not name.endswith('.json'):
                (d / (name + '.json')).write_text(f['description'])
            n += 1; total += len(data)
        print(f'{code}: {n} files, {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
