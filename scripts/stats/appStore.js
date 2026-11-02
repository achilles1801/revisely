// Sales and Trends from the App Store Connect API (read-only): one summary
// report per call, gunzipped and parsed. Needs a team API key with the Sales
// role (ASC_REPORTS_KEY_ID, ASC_REPORTS_ISSUER_ID, ASC_REPORTS_KEY: the .p8's
// text) and the account's vendor number (ASC_VENDOR_NUMBER). Keys are never
// printed.

const crypto = require('crypto');
const zlib = require('zlib');
const { parseSummary } = require('./digest');

const API = 'https://api.appstoreconnect.apple.com';

/** The summary report's version per frequency: monthly and yearly refuse 1_1 (400, Nov 2 2026). */
const VERSIONS = { DAILY: '1_1', WEEKLY: '1_1', MONTHLY: '1_0', YEARLY: '1_0' };

function token(env = process.env) {
  const { ASC_REPORTS_KEY_ID: kid, ASC_REPORTS_ISSUER_ID: iss, ASC_REPORTS_KEY: key } = env;
  if (!kid || !iss || !key) throw new Error('ASC_REPORTS_KEY_ID, ASC_REPORTS_ISSUER_ID and ASC_REPORTS_KEY must be set');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid, typ: 'JWT' });
  const body = b64({ iss, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

/**
 * One summary report: `date` is YYYY-MM-DD (DAILY) or YYYY-MM (MONTHLY).
 * Resolves { rows } with the report's rows, { rows: [] } for a day with no
 * sales, or { missing: true } when Apple hasn't published it yet. Anything
 * else (a refused key, a bad vendor number) throws.
 */
async function salesSummary(date, { frequency = 'DAILY', env = process.env, fetchImpl = fetch, auth } = {}) {
  const vendor = env.ASC_VENDOR_NUMBER;
  if (!vendor) throw new Error('ASC_VENDOR_NUMBER must be set');
  const q = new URLSearchParams({
    'filter[frequency]': frequency,
    'filter[reportType]': 'SALES',
    'filter[reportSubType]': 'SUMMARY',
    'filter[version]': VERSIONS[frequency] || '1_0',
    'filter[reportDate]': date,
    'filter[vendorNumber]': vendor,
  });
  const res = await fetchImpl(`${API}/v1/salesReports?${q}`, {
    headers: { Authorization: `Bearer ${auth || token(env)}`, Accept: 'application/a-gzip' },
  });
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    return { rows: parseSummary(text) };
  }
  let detail = '';
  try {
    detail = ((await res.json()).errors || []).map((e) => e.detail || e.title).join(' ');
  } catch {
    // Not JSON.
  }
  if (res.status === 404) {
    // Apple: "There were no sales for the date specified." vs "Report is not available yet. …"
    return /not available/i.test(detail) ? { missing: true } : { rows: [] };
  }
  throw new Error(`Sales report ${frequency} ${date}: ${res.status} ${detail.slice(0, 300)}`);
}

module.exports = { salesSummary, token };
