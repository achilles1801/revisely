// Maestro runScript (runs in Maestro, on this computer): fills the flow's new account with the Activity
// history the mocks show (activity-redesign/png: d3 October, d1 Tuesday 3 November), so each screenshot
// can be put beside its mock (scripts/verify/activity-boards.py). Writes through the Auth and Firestore
// emulators as their admin ("Bearer owner"), as server-session.js reads them, in one commit.
// The account is output.email (subflows/signup.yaml).
//
// What it writes:
//   - previewTester (the Activity blocks are for testers);
//   - Juz 28's pages (542–561) memorized, with the ratings d1 shows: 548–549 weak, four moderate;
//   - October as d3 shows it: 26 days revised (four of them partly), 9 days memorized (a page each),
//     10 days read, 14 days with a note, and 9, 10, 17, 24 and 30 left out;
//   - 1 and 2 November revised whole;
//   - 3 November as d1 shows it: 18 of 20 revised (556–557 skipped), 34 minutes; a page memorized;
//     a timed read; a note tagged to the day's Revised block.

var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
var PROJECT = 'demo-revisely';
var ROOT = FIRESTORE + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
var NAME = 'projects/' + PROJECT + '/databases/(default)/documents/';
var admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

var lookup = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
  headers: admin,
  body: JSON.stringify({ email: [output.email] }),
});
var users = json(lookup.body).users || [];
if (users.length !== 1) throw new Error('no account for ' + output.email + ' in the Auth emulator');
var uid = users[0].localId;

// Firestore's typed JSON for a plain value.
function fv(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Math.floor(v) === v ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Object.prototype.toString.call(v) === '[object Array]') {
    var values = [];
    for (var i = 0; i < v.length; i++) values.push(fv(v[i]));
    return { arrayValue: { values: values } };
  }
  var fields = {};
  for (var k in v) fields[k] = fv(v[k]);
  return { mapValue: { fields: fields } };
}

var writes = [];
/** Sets `data`'s fields on the document at `path`, leaving its other fields as they are. */
function merge(path, data) {
  var mask = [];
  for (var k in data) mask.push(k);
  writes.push({ update: { name: NAME + path, fields: fv(data).mapValue.fields }, updateMask: { fieldPaths: mask } });
}
/** Writes the document at `path` as `data`. */
function set(path, data) {
  writes.push({ update: { name: NAME + path, fields: fv(data).mapValue.fields } });
}
function range(from, to) {
  var out = [];
  for (var p = from; p <= to; p++) out.push(p);
  return out;
}
function noon(day) {
  var parts = day.split('-');
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 18, 0); // 12:00 in Chicago
}

// 1. The tester flag.
merge('users/' + uid, { previewTester: true });

// 2. Juz 28 memorized, with d1's ratings (1–2 weak, 3 moderate, 4–5 strong).
var JUZ28 = range(542, 561);
var WEAK = [548, 549];
var MODERATE = [544, 551, 553, 559];
for (var j = 0; j < JUZ28.length; j++) {
  var page = JUZ28[j];
  var rating = WEAK.indexOf(page) >= 0 ? 2 : MODERATE.indexOf(page) >= 0 ? 3 : 4;
  merge('users/' + uid + '/pages/' + page, { status: 'memorized', weaknessRating: rating, dateMemorized: '2026-09-01T12:00:00.000Z' });
}
// Pages to revise from: Juz 28, Al-Fatihah and Juz 30 (the signup's).
var POOL = JUZ28.concat([1]).concat(range(582, 604));

function revision(day, assigned, revised, minutes) {
  var skipped = assigned.filter(function (p) {
    return revised.indexOf(p) < 0;
  });
  set('users/' + uid + '/revisions/' + day, {
    id: day,
    uid: uid,
    day: day,
    occurredAt: noon(day),
    countsFor: day,
    source: 'session',
    pages: revised,
    skipped: skipped,
    assigned: assigned,
    minutes: minutes,
    recordings: [],
  });
}
function memorization(day, pages) {
  set('users/' + uid + '/memorizations/' + day, {
    id: day,
    uid: uid,
    day: day,
    occurredAt: noon(day),
    pages: pages,
    source: 'manual',
    minutes: null,
    recordings: [],
  });
}
function read(day, pages, minutes) {
  set('users/' + uid + '/reads/read-' + day, {
    id: 'read-' + day,
    uid: uid,
    day: day,
    occurredAt: noon(day) + 6 * 3600000,
    pages: pages,
    minutes: minutes,
    source: 'automatic',
    recordings: [],
  });
}
function note(day, id, text, at, tag) {
  var entry = { id: id, uid: uid, day: day, at: at, kind: 'note', text: text, minutes: null };
  if (tag) entry.tag = tag;
  set('users/' + uid + '/journal/' + day + '/entries/' + id, entry);
}

// 3. October, as d3 shows it.
var PARTLY = { 4: 15, 12: 17, 19: 14, 25: 13 }; // pages revised of 20
var MISSED = [9, 10, 17, 24, 30];
var MEMORIZED_ON = [2, 6, 8, 13, 15, 20, 22, 27, 29];
var READ_ON = [2, 3, 9, 11, 16, 18, 23, 28, 30, 31];
var NOTE_ON = [1, 3, 5, 7, 12, 14, 17, 19, 21, 25, 26, 28, 29, 31];
for (var d = 1; d <= 31; d++) {
  var day = '2026-10-' + (d < 10 ? '0' + d : String(d));
  if (MISSED.indexOf(d) < 0) {
    var assigned = [];
    for (var a = 0; a < 20; a++) assigned.push(POOL[(d * 7 + a) % POOL.length]);
    var count = PARTLY[d] || 20;
    revision(day, assigned, assigned.slice(0, count), d === 28 ? 31 : 25 + (d % 10));
  }
  if (MEMORIZED_ON.indexOf(d) >= 0) memorization(day, [562 + MEMORIZED_ON.indexOf(d)]);
  if (READ_ON.indexOf(d) >= 0) read(day, d === 28 ? range(562, 567) : [562, 563], d === 28 ? 22 : 25);
  if (NOTE_ON.indexOf(d) >= 0) note(day, 'note-' + day, 'Read Al-Mulk twice before Fajr.', noon(day) + 3 * 3600000, null);
}

// 4. 1 and 2 November, revised whole.
revision('2026-11-01', POOL.slice(20, 40), POOL.slice(20, 40), 28);
revision('2026-11-02', POOL.slice(0, 20), POOL.slice(0, 20), 30);

// 5. Tuesday 3 November, as d1 shows it.
revision('2026-11-03', JUZ28, JUZ28.filter(function (p) {
  return p !== 556 && p !== 557;
}), 34);
memorization('2026-11-03', [563]);
read('2026-11-03', [564, 565], 12);
note('2026-11-03', 'note-d1', '548–549 keep slipping at the turn. Read them twice before Fajr.', Date.UTC(2026, 10, 4, 3, 40), 'revision:2026-11-03');

var commit = http.post(ROOT + ':commit', { headers: admin, body: JSON.stringify({ writes: writes }) });
if (commit.status >= 300) throw new Error('seed commit failed: HTTP ' + commit.status + ' ' + commit.body);
console.log('seeded ' + writes.length + ' documents of Activity history for ' + output.email + ' (' + uid + ')');
