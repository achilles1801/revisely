// Google APIs with a service account key, no dependencies (Node 20+: fetch, crypto).
// Used by the metrics collector on the owner's Mac with the read-only service account
// (scripts/metrics/README.md). The key file never enters the repository.

const crypto = require('crypto');
const fs = require('fs');

const SCOPES = ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/drive'];

function loadKey(file) {
  const key = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!key.client_email || !key.private_key) throw new Error(`${file} is not a service account key`);
  return key;
}

const b64url = (s) => Buffer.from(s).toString('base64url');

/** An OAuth access token for the key (JWT bearer grant), cached until a minute before it expires. */
function tokenSource(key, scopes = SCOPES, fetchImpl = fetch) {
  let cached = null;
  return async function token() {
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.exp - 60 > now) return cached.token;
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.private_key_id }));
    const claim = b64url(JSON.stringify({ iss: key.client_email, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key, 'base64url');
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
    });
    if (!res.ok) throw new Error(`Google token -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    cached = { token: body.access_token, exp: now + (body.expires_in || 3600) };
    return cached.token;
  };
}

/** A JSON client for Google REST APIs. `call(url, {method, body, headers, raw})`. */
function client(token, fetchImpl = fetch) {
  return async function call(url, { method = 'GET', body, headers = {}, raw = false } = {}) {
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${url.split('?')[0]} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

module.exports = { loadKey, tokenSource, client, SCOPES };
