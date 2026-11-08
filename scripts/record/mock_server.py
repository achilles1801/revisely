#!/usr/bin/env python3
"""Try revisely.app/record on this computer: serves docs/ and a stand-in for the Apps Script (the same
requests and answers as apps-script.gs), saving takes to a folder.

  python3 scripts/record/mock_server.py --out /tmp/record-test [--port 8790]
  open http://localhost:8790/record/?endpoint=http://localhost:8790/mock#k=P00-localtest01

The page accepts ?endpoint= only on localhost. Valid codes here: P00-localtest01, P01-localtest02.
"""
import argparse
import base64
import json
import pathlib
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

REPO = pathlib.Path(__file__).resolve().parents[2]
CODES = {'P00-localtest01', 'P01-localtest02'}
TYPES = {'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg'}


class Handler(SimpleHTTPRequestHandler):
    out: pathlib.Path

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def answer(self, value):
        body = json.dumps(value).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def check(self, code):
        code = str(code or '')
        if code not in CODES:
            raise ValueError('bad_code')
        folder = self.out / code.split('-')[0]
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def do_GET(self):
        if not self.path.startswith('/mock'):
            return super().do_GET()
        q = dict(re.findall(r'([a-z]+)=([^&]*)', self.path.split('?', 1)[-1]))
        try:
            folder = self.check(q.get('k'))
            out = {'ok': True, 'pid': folder.name, 'consent': (folder / 'consent.json').exists(),
                   'profile': (folder / 'profile.json').exists(), 'done': [], 'takes': {}}
            for f in folder.iterdir():
                m = re.match(r'^([a-z][a-z0-9]*)_take(\d+)\.', f.name)
                if m:
                    if m[1] not in out['done']:
                        out['done'].append(m[1])
                    out['takes'][m[1]] = max(out['takes'].get(m[1], 0), int(m[2]))
            self.answer(out)
        except ValueError as e:
            self.answer({'ok': False, 'error': str(e)})

    def do_POST(self):
        if not self.path.startswith('/mock'):
            self.send_error(404)
            return
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        try:
            folder = self.check(body.get('k'))
            op = body.get('op')
            if op == 'consent':
                if body.get('who') not in ('adult', 'guardian'):
                    raise ValueError('bad_consent')
                (folder / 'consent.json').write_text(json.dumps({k: body.get(k) for k in ('who', 'text', 'tz', 'ua')}))
                return self.answer({'ok': True})
            if not (folder / 'consent.json').exists():
                raise ValueError('no_consent')
            if op == 'profile':
                (folder / 'profile.json').write_text(json.dumps(body.get('profile') or {}))
                return self.answer({'ok': True})
            if op == 'upload':
                item, take, mime = str(body.get('item')), int(body.get('take') or 0), str(body.get('mime')).split(';')[0]
                if not re.match(r'^[a-z][a-z0-9]{0,7}$', item) or not 1 <= take <= 99 or mime not in TYPES:
                    raise ValueError('bad_take')
                data = base64.b64decode(body.get('data') or '')
                if not data:
                    raise ValueError('bad_size')
                name = f'{item}_take{take}.{TYPES[mime]}'
                (folder / name).write_bytes(data)
                (folder / (name + '.json')).write_text(json.dumps({k: body.get(k) for k in ('item', 'take', 'ms', 'choice')}))
                return self.answer({'ok': True, 'name': name})
            raise ValueError('bad_op')
        except ValueError as e:
            self.answer({'ok': False, 'error': str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--port', type=int, default=8790)
    args = ap.parse_args()
    Handler.out = pathlib.Path(args.out)
    Handler.out.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(REPO / 'docs')))
    print(f'http://localhost:{args.port}/record/?endpoint=http://localhost:{args.port}/mock#k=P00-localtest01')
    server.serve_forever()


if __name__ == '__main__':
    main()
