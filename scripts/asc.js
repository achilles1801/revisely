// App Store Connect from the command line: listing, screenshots, build, pricing, submission.
// No dependencies (Node 18+). Text comes from store/listing.json, screenshots from store/screenshots/.
//
//   node scripts/asc.js status                  what the editable version looks like now; changes nothing
//   node scripts/asc.js version 1.0.1           create the next App Store version (after the current one is live)
//   node scripts/asc.js listing                 write store/listing.json to the editable version (en-US)
//   node scripts/asc.js listing --locale ar-SA  write store/listing.ar-SA.json to that localization, creating it if
//                                               missing (--version 1.0.5 to insist on that version, --dry to print
//                                               field by field what would change and write nothing,
//                                               --whats-new-form minor|feature to pick the file's What's New)
//   node scripts/asc.js check                   check every store/listing*.json against the limits; no key needed
//   node scripts/asc.js whats-new "text"        "What's New" for an update (not allowed on the first version)
//   node scripts/asc.js screenshots             replace the 6.9" iPhone set with store/screenshots/*.png
//   node scripts/asc.js build 12                attach a processed build to the editable version
//   node scripts/asc.js release auto|manual     release on approval, or wait for a manual release
//   node scripts/asc.js submit                  submit the editable version for review
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (a team key with App Manager access; see CLAUDE.md).
// ASC_DEMO_PASSWORD, if set, is written with the listing; otherwise the stored password is kept.
//
// Locales (Nov 21 2026): store/listing.json is en-US and has no name, so en-US's name is never written (Majd wants
// it as it is). store/listing.<locale>.json holds another localization: its name, subtitle, keywords, description,
// promotional text, URLs and What's New (one text, or { minor, feature } picked with --whats-new-form). Limits are
// checked before anything is written, and text over one is refused, never cut. Screenshots stay the primary
// language's: App Store Connect shows them for a localization that has none.
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

/** App Store Connect's limits, in characters. Keywords are also held to 100 UTF-8 bytes (multi-byte scripts). */
const LIMITS = { name: 30, subtitle: 30, promotionalText: 170, keywords: 100, description: 4000, whatsNew: 4000 };
const KEYWORD_BYTES = 100;
const REVIEW_NOTES_LIMIT = 4000;
const WHATS_NEW_FORMS = ['minor', 'feature'];
const LOCALE_RE = /^[a-z]{2,3}(-[A-Z]{2}|-Hans|-Hant)?$/;
/** Fields of the app info localization, and of the version localization, that a locale file may hold. */
const INFO_FIELDS = ['name', 'subtitle', 'privacyPolicyUrl'];
const VERSION_FIELDS = ['description', 'keywords', 'promotionalText', 'supportUrl', 'marketingUrl', 'whatsNew'];

/** `listing --locale ar-SA --dry` → { _: ['listing'], locale: 'ar-SA', dry: true }. */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) out._.push(a);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

/** The listing file for a locale: store/listing.json for en-US (no locale), store/listing.<locale>.json otherwise. */
function listingFile(locale, dir = STORE) {
  if (!locale || locale === LOCALE) return path.join(dir, 'listing.json');
  if (!LOCALE_RE.test(locale)) throw new Error(`Not a locale code: ${locale} (e.g. en-GB, ar-SA, id)`);
  return path.join(dir, `listing.${locale}.json`);
}

function readListing(locale, dir = STORE) {
  const file = listingFile(locale, dir);
  if (!fs.existsSync(file)) throw new Error(`No ${path.relative(path.join(dir, '..'), file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const chars = (s) => [...s].length;

/** Everything over a limit, as lines; empty when the listing fits. Never changes the text. */
function checkLimits(L) {
  const problems = [];
  const check = (label, field, value) => {
    if (typeof value !== 'string') return;
    if (chars(value) > LIMITS[field]) problems.push(`${label}: ${chars(value)} characters, the limit is ${LIMITS[field]}`);
    if (field === 'keywords' && Buffer.byteLength(value, 'utf8') > KEYWORD_BYTES) {
      problems.push(`${label}: ${Buffer.byteLength(value, 'utf8')} bytes, the limit is ${KEYWORD_BYTES}`);
    }
  };
  for (const field of Object.keys(LIMITS)) {
    const value = L[field];
    if (field === 'whatsNew' && value && typeof value === 'object') {
      for (const [form, text] of Object.entries(value)) check(`whatsNew.${form}`, field, text);
    } else check(field, field, value);
  }
  return problems;
}

/** The What's New to write: the file's one text, or the form picked. Undefined when the file has none. */
function whatsNewText(L, form) {
  const w = L.whatsNew;
  if (w == null) return undefined;
  if (typeof w === 'string') return w;
  if (!form) throw new Error(`This file has What's New forms (${Object.keys(w).join(', ')}): pass --whats-new-form minor|feature`);
  if (!WHATS_NEW_FORMS.includes(form) || typeof w[form] !== 'string') throw new Error(`No What's New form "${form}" in this file`);
  return w[form];
}

/** What a locale file writes: the app info localization's fields and the version localization's. */
function localePlan(L, form) {
  const pick = (fields, src) => Object.fromEntries(fields.filter((f) => src[f] !== undefined).map((f) => [f, src[f]]));
  return {
    info: pick(INFO_FIELDS, L),
    version: pick(VERSION_FIELDS, { ...L, whatsNew: whatsNewText(L, form) }),
  };
}

function show(v) {
  if (v == null || v === '') return '(empty)';
  const text = chars(v) > 100 ? `${[...v].slice(0, 97).join('')}…` : v;
  return `${JSON.stringify(text)} (${chars(v)} characters)`;
}

/** The dry run's lines: each field, unchanged or from → to. `current` is null for a localization to be created. */
function describeChanges(label, current, next) {
  const lines = [current ? `${label}:` : `${label}: would be created`];
  for (const [k, v] of Object.entries(next)) {
    const was = current ? current[k] : undefined;
    lines.push(was === v ? `  ${k}: unchanged` : `  ${k}: ${show(was)} → ${show(v)}`);
  }
  return lines;
}

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

async function editable(appId, versionString, locale = LOCALE) {
  const versions = (await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`)).data;
  const version = versions.find((v) => EDITABLE.includes(v.attributes.appStoreState));
  if (!version) {
    const states = versions.map((v) => `${v.attributes.versionString} ${v.attributes.appStoreState}`).join(', ');
    throw new Error(`No editable version (${states}). Create one with: node scripts/asc.js version <x.y.z>`);
  }
  if (versionString && version.attributes.versionString !== versionString) {
    throw new Error(`The editable version is ${version.attributes.versionString}, not ${versionString}`);
  }
  const vLoc = (await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data
    .find((l) => l.attributes.locale === locale);
  return { version, vLoc };
}

/** The app info being prepared (its localizations hold the name and subtitle), and the locale's localization. */
async function editableInfo(appId, locale = LOCALE) {
  const infos = (await api('GET', `/v1/apps/${appId}/appInfos`)).data;
  const info = infos.find((i) => i.attributes.appStoreState !== 'READY_FOR_SALE') || infos[0];
  const iLoc = (await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`)).data.find((l) => l.attributes.locale === locale);
  return { info, iLoc };
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

async function listing(opts = {}) {
  if (opts.locale === true) throw new Error('Usage: listing --locale <code>, e.g. en-GB, ar-SA, id');
  const locale = opts.locale || LOCALE;
  const dry = opts.dry === true;
  const L = readListing(locale);
  const problems = checkLimits(L);
  if (problems.length) throw new Error(`Over a limit, so nothing was written:\n  ${problems.join('\n  ')}`);
  if (locale === LOCALE) return listingUS(L, opts, dry);

  const plan = localePlan(L, opts['whats-new-form']);
  const a = await app();
  const { version, vLoc } = await editable(a.id, opts.version, locale);
  const { info, iLoc } = await editableInfo(a.id, locale);
  if (!iLoc && !plan.info.name) throw new Error(`A new ${locale} localization needs a name in its file`);
  const label = `${locale} on ${version.attributes.versionString}`;
  if (dry) {
    console.log(`Dry run, nothing written (${label}):`);
    for (const line of describeChanges('App info localization', iLoc?.attributes ?? null, plan.info)) console.log(line);
    for (const line of describeChanges('Version localization', vLoc?.attributes ?? null, plan.version)) console.log(line);
    return;
  }
  // Name and subtitle live on the app info, which is only editable while a version is in preparation.
  if (iLoc) await patch('appInfoLocalizations', iLoc.id, plan.info);
  else await api('POST', '/v1/appInfoLocalizations', { data: { type: 'appInfoLocalizations', attributes: { locale, ...plan.info },
    relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } });
  if (vLoc) await patch('appStoreVersionLocalizations', vLoc.id, plan.version);
  else await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale, ...plan.version },
    relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
  console.log(`✓ ${iLoc && vLoc ? 'updated' : 'created'} ${label}`);
}

/** en-US: store/listing.json, as before (no name), with the review notes and the copyright. */
async function listingUS(L, opts, dry) {
  const a = await app();
  const { version, vLoc } = await editable(a.id, opts.version);
  const { iLoc } = await editableInfo(a.id);
  const versionFields = { description: L.description, keywords: L.keywords, promotionalText: L.promotionalText,
    supportUrl: L.supportUrl, marketingUrl: L.marketingUrl };
  const infoFields = { subtitle: L.subtitle, privacyPolicyUrl: L.privacyPolicyUrl };
  if (chars(L.reviewNotes ?? '') > REVIEW_NOTES_LIMIT) {
    console.log(`  note: the review notes are ${chars(L.reviewNotes)} characters; App Store Connect takes ${REVIEW_NOTES_LIMIT}`);
  }
  if (dry) {
    console.log(`Dry run, nothing written (${LOCALE} on ${version.attributes.versionString}):`);
    for (const line of describeChanges('App info localization', iLoc?.attributes ?? null, infoFields)) console.log(line);
    for (const line of describeChanges('Version localization', vLoc?.attributes ?? null, versionFields)) console.log(line);
    console.log(`  copyright: ${show(version.attributes.copyright)} → ${show(L.copyright)}`);
    console.log(`  review notes: ${chars(L.reviewNotes ?? '')} characters, demo account ${L.demoUser}`);
    return;
  }
  await patch('appStoreVersionLocalizations', vLoc.id, versionFields);
  // Subtitle and privacy URL live on the app info, which is only editable while a version is in preparation.
  await patch('appInfoLocalizations', iLoc.id, infoFields)
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

/** Every listing file against the limits, offline. */
function checkAll(dir = STORE) {
  const files = fs.readdirSync(dir).filter((f) => /^listing(\.[A-Za-z-]+)?\.json$/.test(f)).sort();
  let bad = 0;
  for (const f of files) {
    const problems = checkLimits(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    console.log(problems.length ? `✗ ${f}\n  ${problems.join('\n  ')}` : `✓ ${f}`);
    bad += problems.length;
  }
  return bad;
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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [cmd, arg] = opts._;
  const commands = {
    status, version: () => createVersion(arg), listing: () => listing(opts), 'whats-new': () => whatsNew(arg), screenshots,
    build: () => attachBuild(arg), release: () => release(arg), submit,
  };
  if (cmd === 'check') process.exit(checkAll() ? 1 : 0);
  if (!commands[cmd]) {
    console.error(`Commands: ${[...Object.keys(commands), 'check'].join(', ')}`);
    process.exit(1);
  }
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
    console.error('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH (see CLAUDE.md).');
    process.exit(1);
  }
  commands[cmd]().catch((e) => { console.error(e.message); process.exit(1); });
}

if (require.main === module) main();

module.exports = { LIMITS, parseArgs, listingFile, readListing, checkLimits, whatsNewText, localePlan, describeChanges, checkAll };
