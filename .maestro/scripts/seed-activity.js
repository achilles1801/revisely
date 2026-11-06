// Maestro runScript (runs in Maestro, on this computer): fills the flow's new account with a
// fortnight of Activity history, so the Activity screens have something to show (gap audit verify
// boards). Writes through the Auth and Firestore emulators as the emulators' admin ("Bearer owner"),
// the way server-session.js reads them. The account is output.email (subflows/signup.yaml).
//
// What it writes, for the test clock's fortnight (Oct 20 – Nov 3 2026):
//   - the account's previewTester flag (the Activity blocks are for testers);
//   - a Revised item a day (most days; some missed, some partly done), with minutes;
//   - a Memorized item on two days, and two timed reads;
//   - two notes in the day's log, one tagged to that day's Revised block.
// Memorized pages are the signup's (Al-Fatihah and Juz 30: page 1 and 582–604).

var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
var PROJECT = 'demo-revisely';
var ROOT = FIRESTORE + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
var admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

var lookup = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
  headers: admin,
  body: JSON.stringify({ email: [output.email] }),
});
var users = json(lookup.body).users || [];
if (users.length !== 1) throw new Error('no account for ' + output.email + ' in the Auth emulator');
var uid = users[0].localId;
var USER = ROOT + '/users/' + uid;

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

// Writes are gathered and sent as one commit at the end (the emulator's batch endpoint).
var writes = [];
var NAME = 'projects/' + PROJECT + '/databases/(default)/documents/';

function put(path, body, mask) {
  var w = { update: { name: NAME + path, fields: body } };
  if (mask) w.updateMask = { fieldPaths: [mask] };
  writes.push(w);
}

function create(collection, id, data) {
  writes.push({ update: { name: NAME + collection + '/' + id, fields: fv(data).mapValue.fields } });
}

// 1. The tester flag: the Activity blocks show for previewTester accounts (activityBlocksEnabled).
put('users/' + uid, { previewTester: { booleanValue: true } }, 'previewTester');

// 2. A fortnight of Revised items. Day i of Oct 20 + i; noon UTC as the time of the session.
var MEMORIZED = [1];
for (var p = 582; p <= 604; p++) MEMORIZED.push(p);
var start = Date.UTC(2026, 9, 20, 12, 0);
var DAY_MS = 86400000;
for (var i = 0; i < 15; i++) {
  if (i % 5 === 4) continue; // a missed day
  var d = new Date(start + i * DAY_MS);
  var day = d.toISOString().slice(0, 10);
  var assigned = [];
  for (var a = 0; a < 10; a++) assigned.push(MEMORIZED[(i * 3 + a) % MEMORIZED.length]);
  var revised = assigned.filter(function (page, idx) {
    return !(i % 3 === 0 && idx >= 7); // partly done on some days: the last three skipped
  });
  var skipped = assigned.filter(function (page) {
    return revised.indexOf(page) < 0;
  });
  create('users/' + uid + '/revisions', day + '-s', {
    id: day + '-s',
    uid: uid,
    day: day,
    occurredAt: start + i * DAY_MS,
    countsFor: day,
    source: 'session',
    pages: revised,
    skipped: skipped,
    assigned: assigned,
    minutes: 20 + (i % 15),
    recordings: [],
  });
}

// 3. Memorized on two days, and two timed reads.
create('users/' + uid + '/memorizations', '2026-10-24', {
  id: '2026-10-24',
  day: '2026-10-24',
  occurredAt: Date.UTC(2026, 9, 24, 12, 0),
  pages: [582, 583, 584],
  source: 'manual',
  minutes: null,
  recordings: [],
});
create('users/' + uid + '/memorizations', '2026-10-30', {
  id: '2026-10-30',
  day: '2026-10-30',
  occurredAt: Date.UTC(2026, 9, 30, 12, 0),
  pages: [585, 586],
  source: 'manual',
  minutes: null,
  recordings: [],
});
create('users/' + uid + '/reads', 'read-1027', {
  id: 'read-1027',
  day: '2026-10-27',
  occurredAt: Date.UTC(2026, 9, 27, 18, 0),
  pages: [590, 591],
  minutes: 15,
  source: 'automatic',
  recordings: [],
});
create('users/' + uid + '/reads', 'read-1101', {
  id: 'read-1101',
  day: '2026-11-01',
  occurredAt: Date.UTC(2026, 10, 1, 18, 0),
  pages: [600],
  minutes: 8,
  source: 'automatic',
  recordings: [],
});

// 4. Two notes in the day's log: one tagged to that day's Revised block (ACT-11), one plain.
var notes = [
  { day: '2026-11-02', id: 'note-a', text: 'Juz 30 starts to slip at the turn: read the pairs twice.', tag: 'revision:2026-11-02' },
  { day: '2026-11-03', id: 'note-b', text: 'Ask Umm Hani about the recitation pace.', tag: null },
];
for (var n = 0; n < notes.length; n++) {
  var note = notes[n];
  var at = Date.UTC(2026, 10, n + 2, 21, 0);
  var entry = { id: note.id, at: at, kind: 'note', text: note.text, minutes: null };
  if (note.tag) entry.tag = note.tag;
  create('users/' + uid + '/journal/' + note.day + '/entries', note.id, entry);
}

var commit = http.post(ROOT + ':commit', { headers: admin, body: JSON.stringify({ writes: writes }) });
if (commit.status >= 300) throw new Error('seed commit failed: HTTP ' + commit.status + ' ' + commit.body);
console.log('seeded ' + writes.length + ' documents of Activity history for ' + output.email + ' (' + uid + ')');
