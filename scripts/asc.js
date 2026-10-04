// App Store Connect from the command line: listing, screenshots, build, pricing, submission.
// No dependencies (Node 18+). Text comes from store/listing.json, screenshots from store/screenshots/.
//
//   node scripts/asc.js status                  what the editable version looks like now; changes nothing
//   node scripts/asc.js version 1.0.1           create the next App Store version (after the current one is live)
//   node scripts/asc.js listing                 write store/listing.json to the editable version
//   node scripts/asc.js whats-new "text"        "What's New" for an update (not allowed on the first version)
//   node scripts/asc.js screenshots             replace the 6.9" iPhone set with store/screenshots/*.png
//   node scripts/asc.js build 12                attach a processed build to the editable version
//   node scripts/asc.js release auto|manual     release on approval, or wait for a manual release
//   node scripts/asc.js submit                  submit the editable version for review
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (a team key with App Manager access; see CLAUDE.md).
// ASC_DEMO_PASSWORD, if set, is written with the listing; otherwise the stored password is kept.
//
// Pricing (Free) and availability (all territories but mainland China) are set once per app and are
// not repeated here.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BUNDLE_ID = 'com.revisionbuddy.app';
const LOCALE = 'en-US';
const STORE = path.join(__dirname, '..', 'store');
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'];
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' });
  const body = b64({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), {
    key: fs.readFileSync(ASC_KEY_PATH.replace(/^~/, process.env.HOME)), dsaEncoding: 'ieee-p1363',
  });
  return `${head}.${body}.${sig.toString('base64url')}`;
}

async function api(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `https://api.appstoreconnect.apple.com${url}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const errs = (json.errors || []).map((e) => `${e.status} ${e.code}: ${e.detail}`).join('\n  ');
    throw new Error(`${method} ${url} -> ${res.status}\n  ${errs}`);
  }
  return json;
}

const patch = (type, id, attributes) => api('PATCH', `/v1/${type}/${id}`, { data: { type, id, attributes } });

async function app() {
  return (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`)).data[0];
}

async function editable(appId) {
  const versions = (await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`)).data;
  const version = versions.find((v) => EDITABLE.includes(v.attributes.appStoreState));
  if (!version) {
    const states = versions.map((v) => `${v.attributes.versionString} ${v.attributes.appStoreState}`).join(', ');
    throw new Error(`No editable version (${states}). Create one with: node scripts/asc.js version <x.y.z>`);
  }
  const vLoc = (await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data
    .find((l) => l.attributes.locale === LOCALE);
  return { version, vLoc };
}

async function status() {
  const a = await app();
  const versions = (await api('GET', `/v1/apps/${a.id}/appStoreVersions?filter[platform]=IOS&limit=20`)).data;
  for (const v of versions) {
    const build = await api('GET', `/v1/appStoreVersions/${v.id}/build`).catch(() => ({ data: null }));
    console.log(`${v.attributes.versionString}  ${v.attributes.appStoreState}  release=${v.attributes.releaseType}  build=${build.data?.attributes?.version ?? 'none'}`);
  }
  const subs = (await api('GET', `/v1/reviewSubmissions?filter[app]=${a.id}&limit=5`)).data;
  for (const s of subs) console.log(`review submission ${s.attributes.submittedDate ?? '(not submitted)'}  ${s.attributes.state}`);
}

async function createVersion(versionString) {
  if (!versionString) throw new Error('Usage: version <x.y.z>');
  const a = await app();
  const v = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions',
    attributes: { platform: 'IOS', versionString, releaseType: 'AFTER_APPROVAL' },
    relationships: { app: { data: { type: 'apps', id: a.id } } } } })).data;
  console.log(`✓ version ${versionString} created (${v.attributes.appStoreState}); the listing carries over from the last version`);
}

async function listing() {
  const L = JSON.parse(fs.readFileSync(path.join(STORE, 'listing.json'), 'utf8'));
  const a = await app();
  const { version, vLoc } = await editable(a.id);

  await patch('appStoreVersionLocalizations', vLoc.id, {
    description: L.description, keywords: L.keywords, promotionalText: L.promotionalText,
    supportUrl: L.supportUrl, marketingUrl: L.marketingUrl,
  });
  const infos = (await api('GET', `/v1/apps/${a.id}/appInfos`)).data;
  const info = infos.find((i) => i.attributes.appStoreState !== 'READY_FOR_SALE') || infos[0];
  const iLoc = (await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`)).data.find((l) => l.attributes.locale === LOCALE);
  // Subtitle and privacy URL live on the app info, which is only editable while a version is in preparation.
  await patch('appInfoLocalizations', iLoc.id, { subtitle: L.subtitle, privacyPolicyUrl: L.privacyPolicyUrl })
    .catch((e) => console.log(`  subtitle/privacy URL not changed: ${e.message.split('\n')[1]?.trim()}`));
  await patch('appStoreVersions', version.id, { copyright: L.copyright });

  const review = { demoAccountName: L.demoUser, demoAccountRequired: true, notes: L.reviewNotes };
  if (process.env.ASC_DEMO_PASSWORD) review.demoAccountPassword = process.env.ASC_DEMO_PASSWORD;
  const detail = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => ({ data: null }));
  if (detail.data) await patch('appStoreReviewDetails', detail.data.id, review);
  else await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: review,
    relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
  console.log(`✓ listing written to ${version.attributes.versionString}`);
}

async function whatsNew(text) {
  if (!text) throw new Error('Usage: whats-new "text"');
  const { version, vLoc } = await editable((await app()).id);
  await patch('appStoreVersionLocalizations', vLoc.id, { whatsNew: text });
  console.log(`✓ What's New set on ${version.attributes.versionString}`);
}

async function screenshots() {
  const dir = path.join(STORE, 'screenshots');
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort();
  const { vLoc } = await editable((await app()).id);
  const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${vLoc.id}/appScreenshotSets`)).data;
  let set = sets.find((s) => s.attributes.screenshotDisplayType === 'APP_IPHONE_67');
  if (set) {
    for (const s of (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data) await api('DELETE', `/v1/appScreenshots/${s.id}`);
  } else {
    set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: 'APP_IPHONE_67' },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: vLoc.id } } } } })).data;
  }
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: f, fileSize: buf.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } })).data;
    for (const op of shot.attributes.uploadOperations) {
      const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
      const res = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`upload ${f} -> ${res.status}`);
    }
    await patch('appScreenshots', shot.id, { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(buf).digest('hex') });
    console.log(`✓ ${f}`);
  }
}

async function attachBuild(number) {
  if (!number) throw new Error('Usage: build <build number>');
  const a = await app();
  const { version } = await editable(a.id);
  const builds = (await api('GET', `/v1/builds?filter[app]=${a.id}&filter[version]=${number}`)).data;
  if (!builds.length) throw new Error(`Build ${number} not found (still processing at Apple?)`);
  await api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: builds[0].id } });
  console.log(`✓ build ${number} attached to ${version.attributes.versionString}`);
}

async function release(mode) {
  const releaseType = { auto: 'AFTER_APPROVAL', manual: 'MANUAL' }[mode];
  if (!releaseType) throw new Error('Usage: release auto|manual');
  const { version } = await editable((await app()).id);
  await patch('appStoreVersions', version.id, { releaseType });
  console.log(`✓ ${version.attributes.versionString}: ${releaseType}`);
}

async function submit() {
  const a = await app();
  const { version } = await editable(a.id);
  const open = (await api('GET', `/v1/reviewSubmissions?filter[app]=${a.id}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES`)).data;
  const sub = open[0] || (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
    relationships: { app: { data: { type: 'apps', id: a.id } } } } })).data;
  const items = (await api('GET', `/v1/reviewSubmissions/${sub.id}/items`)).data;
  if (!items.length) await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: {
    reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } },
    appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
  const done = (await patch('reviewSubmissions', sub.id, { submitted: true })).data;
  console.log(`✓ ${version.attributes.versionString} submitted: ${done.attributes.state}`);
}

const [cmd, arg] = process.argv.slice(2);
const commands = {
  status, version: () => createVersion(arg), listing, 'whats-new': () => whatsNew(arg), screenshots,
  build: () => attachBuild(arg), release: () => release(arg), submit,
};
if (!commands[cmd]) {
  console.error(`Commands: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
  console.error('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH (see CLAUDE.md).');
  process.exit(1);
}
commands[cmd]().catch((e) => { console.error(e.message); process.exit(1); });
