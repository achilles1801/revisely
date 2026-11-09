// Maestro runScript: makes the flow's new account DAYS days old (1, 7 or 365), as Insights' ranges need to
// be seen on (ACT-22; Majd, Nov 8 2026, on a day-old account: "think i found a bug when u filter by all
// time or 3 months"). Today is Sunday 8 November 2026 (the flow's CLOCK). Writes through the emulators as
// their admin ("Bearer owner"), as seed-activity.js does.
//
// What it writes:
//   - the account: previewTester, Smart Tracking on, created DAYS - 1 days before today;
//   - Juz 30 memorized from that day (Al-Fatihah, which onboarding marks, is taken off: 23 pages, as on
//     Majd's phone);
//   - a revision item for each day: five pages at 7:10 PM, round Juz 30; a day-old account revises one page.

var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
var PROJECT = 'demo-revisely';
var ROOT = FIRESTORE + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
var NAME = 'projects/' + PROJECT + '/databases/(default)/documents/';
var admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
var HISTORY = Number(typeof DAYS !== 'undefined' ? DAYS : '1');
var TODAY = '2026-11-08';

var lookup = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
  headers: admin,
  body: JSON.stringify({ email: [output.email] }),
});
var users = json(lookup.body).users || [];
if (users.length !== 1) throw new Error('no account for ' + output.email + ' in the Auth emulator');
var uid = users[0].localId;

function ts(ms) {
  return { ts: ms };
}
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
  if (typeof v.ts === 'number' && Object.keys(v).length === 1) return { timestampValue: new Date(v.ts).toISOString() };
  var fields = {};
  for (var k in v) fields[k] = fv(v[k]);
  return { mapValue: { fields: fields } };
}
var writes = [];
function merge(path, data) {
  var mask = [];
  for (var k in data) mask.push(k);
  writes.push({ update: { name: NAME + path, fields: fv(data).mapValue.fields }, updateMask: { fieldPaths: mask } });
}
function set(path, data) {
  writes.push({ update: { name: NAME + path, fields: fv(data).mapValue.fields } });
}
/** The day `n` days before today. */
function before(n) {
  return new Date(Date.parse(TODAY + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
}
/** `hour`:`minute` in Chicago on `day` (CDT until 1 November 2026, CST from then). */
function local(day, hour, minute) {
  var parts = day.split('-');
  var offset = day < '2026-11-01' && day >= '2026-03-08' ? 5 : 6;
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), hour + offset, minute || 0);
}

var FIRST = before(HISTORY - 1);
merge('users/' + uid, {
  previewTester: true,
  smartTrackingEnabled: true,
  hasSeenSmartTrackingPreview: true,
  createdAt: ts(local(FIRST, 12, 0)),
});
merge('users/' + uid + '/pages/1', { status: 'not_memorized', dateMemorized: null });
var JUZ30 = [];
for (var p = 582; p <= 604; p++) {
  JUZ30.push(p);
  merge('users/' + uid + '/pages/' + p, { status: 'memorized', dateMemorized: ts(local(FIRST, 12, 0)) });
}
for (var k = 0; k < HISTORY; k++) {
  var day = before(k);
  var at = local(day, 19, 10);
  var start = (k * 5) % 20;
  var pages = HISTORY === 1 ? [582] : JUZ30.slice(start, start + 5);
  set('users/' + uid + '/revisions/' + day, {
    id: day,
    uid: uid,
    day: day,
    occurredAt: at,
    countsFor: day,
    source: 'session',
    pages: pages,
    skipped: [],
    assigned: pages,
    minutes: 20,
    recordings: [],
  });
}
// The app is running and signed in while this writes, and its own writes can hold the account's documents:
// the emulator then answers 409 "Transaction lock timeout" (both attempts of the first run, Nov 9 2026). So
// the account and its pages go first, the revisions after in small commits, and a 409 is tried again after
// a pause (Maestro's scripts have no timers: the pause is a wait on the clock).
function pause(ms) {
  var until = Date.now() + ms;
  while (Date.now() < until) {
    /* waiting */
  }
}
function commitAll(list, size) {
  for (var c = 0; c < list.length; c += size) {
    var body = JSON.stringify({ writes: list.slice(c, c + size) });
    for (var attempt = 1; ; attempt++) {
      var commit = http.post(ROOT + ':commit', { headers: admin, body: body });
      if (commit.status < 300) break;
      if (commit.status !== 409 || attempt >= 8) throw new Error('seed commit failed: HTTP ' + commit.status + ' ' + commit.body);
      pause(1500 * attempt);
    }
  }
}
var ACCOUNT_WRITES = 25; // the user, Al-Fatihah and Juz 30's 23 pages, written first
commitAll(writes.slice(0, ACCOUNT_WRITES), ACCOUNT_WRITES);
commitAll(writes.slice(ACCOUNT_WRITES), 100);
console.log('seeded ' + HISTORY + ' days of history (' + writes.length + ' documents) for ' + output.email + ' (' + uid + ')');
