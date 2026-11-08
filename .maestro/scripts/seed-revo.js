// Maestro runScript (runs in Maestro, on this computer): gives the flow's new account the revision
// history the Revo mocks show (~/Documents/revisely-today-mocks/revo: Maryam, Tue 3 Nov 2026, Juz 28),
// so Revo's greeting, chips, charts and plan are about that data and each screenshot can be put
// beside its mock. Writes through the Auth and Firestore emulators as their admin ("Bearer owner"),
// as server-session.js reads them, in one commit. The account is output.email (subflows/signup.yaml).
//
// What it writes:
//   - Juz 28 (542–561) memorized and nothing else (the signup's Al-Fatihah and Juz 30 unmarked), 20
//     pages a day: every day's revision is Juz 28, so today is "Continue at Al-Hashr, ayah 17" (page 548).
//   - Ratings: 548–549 weak (2), 544, 551, 553 and 559 moderate (3), the rest strong (4).
//   - A session every day from 4 October (the 31 days Revo's charts show), with 10, 11 and 17 October
//     left out, so the streak is the 12 days from 22 October; 548–549 rated strong and moderate on
//     4 October and weak on 18 October and 1 November (the slipping pair the mock's chart shows).
//   - Today, 3 November: 542–547 revised (6 of 20), 548–549 next.

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

/** A timestamp field (ms since epoch). */
function ts(ms) {
  return { __ts: ms };
}
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
  if (v.__ts !== undefined) return { timestampValue: new Date(v.__ts).toISOString() };
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
function dayOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

var JUZ28 = range(542, 561);
var WEAK = [548, 549];
var MODERATE = [544, 551, 553, 559];
function ratingOf(page) {
  return WEAK.indexOf(page) >= 0 ? 2 : MODERATE.indexOf(page) >= 0 ? 3 : 4;
}

// 1. Twenty pages a day.
// The mocks' account rates its pages (548–549 weak), so it has Smart Tracking on: without it Revo
// says nothing about strength (REVO-35).
merge('users/' + uid, { dailyPageCapacity: 20, smartTrackingEnabled: true });

// 2. Juz 28 memorized with its ratings; the signup's pages unmarked.
var TODAY = '2026-11-03';
var DONE_TODAY = range(542, 547);
for (var j = 0; j < JUZ28.length; j++) {
  var page = JUZ28[j];
  merge('users/' + uid + '/pages/' + page, {
    status: 'memorized',
    weaknessRating: ratingOf(page),
    dateMemorized: '2026-09-01T12:00:00.000Z',
    lastRevisedDate: DONE_TODAY.indexOf(page) >= 0 ? TODAY : '2026-11-02',
    totalRevisionCount: 28,
  });
}
var UNMARK = [1].concat(range(582, 604));
for (var u = 0; u < UNMARK.length; u++) {
  merge('users/' + uid + '/pages/' + UNMARK[u], { status: 'not_memorized', dateMemorized: null });
}

// 3. The sessions.
function session(day, revised, minutes, ratings) {
  var at = noon(day);
  var updates = [];
  for (var r = 0; r < ratings.length; r++) {
    updates.push({ pageNumber: ratings[r][0], previousRating: 4, newRating: ratings[r][1], changedAt: ts(at) });
  }
  var complete = revised.length >= JUZ28.length;
  set('users/' + uid + '/sessions/' + day, {
    id: day,
    date: day,
    state: complete ? 'COMPLETED' : 'IN_PROGRESS',
    createdAt: ts(at),
    updatedAt: ts(at + minutes * 60000),
    completedAt: complete ? ts(at + minutes * 60000) : null,
    durationMinutes: minutes,
    assignedPages: JUZ28,
    totalAssignedPages: JUZ28.length,
    pagesRevised: revised,
    pagesSkipped: [],
    weaknessUpdates: updates,
    completionPercentage: Math.round((revised.length / JUZ28.length) * 100),
  });
}
var LEFT_OUT = ['2026-10-10', '2026-10-11', '2026-10-17'];
var RATINGS = {
  '2026-10-04': [[548, 5], [549, 3]],
  '2026-10-18': [[548, 2], [549, 2]],
  '2026-11-01': [[548, 2], [549, 2]],
};
for (var t = noon('2026-10-04'); dayOf(t) < TODAY; t += 86400000) {
  var day = dayOf(t);
  if (LEFT_OUT.indexOf(day) >= 0) continue;
  session(day, JUZ28, 25 + (Number(day.slice(8)) % 10), RATINGS[day] || []);
}
session(TODAY, DONE_TODAY, 14, []);

var commit = http.post(ROOT + ':commit', { headers: admin, body: JSON.stringify({ writes: writes }) });
if (commit.status >= 300) throw new Error('seed commit failed: HTTP ' + commit.status + ' ' + commit.body);
console.log('seeded ' + writes.length + ' documents of Revo history for ' + output.email + ' (' + uid + ')');
