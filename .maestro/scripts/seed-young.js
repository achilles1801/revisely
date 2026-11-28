// Maestro runScript (runs in Maestro, on this computer): a young account for Insights' seven pages
// (24-insights-young.yaml), the case that broke before: two weeks of revising, a month of
// memorizing, and (with seed-recite-takes.js after it) a few takes. Today is Monday 16 November 2026 (the flow's CLOCK).
// Writes through the Auth and Firestore emulators as their admin ("Bearer owner"), as seed-activity.js does.
//
// What it writes:
//   - the account: previewTester, Smart Tracking on, 5 pages a day, recording backup off;
//   - Juz 30 memorized, 23 pages, from the end back (604 first), over 17 days from 19 October to 14 November;
//   - a revision item and its session on 11 of the last 14 days (6, 9 and 13 November missed), five pages each from
//     what was memorized by then, in the evening but for three mornings; p. 589 rated weak twice, p. 595 moderate once;
//   - no reads (Consistency's Reading has nothing yet).
//   seed-recite-takes.js runs after it (subflows/seed-young.yaml): its takes, and the Juz 30 pages' ratings and dates.
// Times are the simulator's (America/Chicago: CDT until 1 November 2026, CST from then).

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

/** A Firestore timestamp (`{ ts: ms }` in the data). */
function ts(ms) {
  return { ts: ms };
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
  if (typeof v.ts === 'number' && Object.keys(v).length === 1) return { timestampValue: new Date(v.ts).toISOString() };
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
function without(pages, drop) {
  return pages.filter(function (p) {
    return drop.indexOf(p) < 0;
  });
}
/** `hour`:`minute` in Chicago on `day` (CDT until 1 November 2026, CST from then). */
function local(day, hour, minute) {
  var parts = day.split('-');
  var offset = day < '2026-11-01' ? 5 : 6;
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), hour + offset, minute || 0);
}
function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

// ── The account ─────────────────────────────────────────────────────────────
merge('users/' + uid, {
  previewTester: true,
  smartTrackingEnabled: true,
  hasSeenSmartTrackingPreview: true,
  dailyPageCapacity: 5,
  recordingBackup: false,
});

// ── Juz 30, memorized from the end back over a month ──────────────────────
// [day, pages that day]: 23 pages in all, 604 first.
var MEMORIZED = [
  ['2026-10-19', 2], ['2026-10-20', 1], ['2026-10-22', 2], ['2026-10-23', 1], ['2026-10-25', 1], ['2026-10-27', 2],
  ['2026-10-28', 1], ['2026-10-30', 1], ['2026-11-01', 2], ['2026-11-03', 1], ['2026-11-04', 1], ['2026-11-06', 2],
  ['2026-11-08', 1], ['2026-11-10', 2], ['2026-11-11', 1], ['2026-11-13', 1], ['2026-11-14', 1],
];
/** The pages memorized by the end of `dayId`, newest last. */
var memorizedBy = {};
var next = 604;
var sofar = [];
for (var i = 0; i < MEMORIZED.length; i++) {
  var dayId = MEMORIZED[i][0];
  var pages = range(next - MEMORIZED[i][1] + 1, next).reverse();
  next -= MEMORIZED[i][1];
  for (var p = 0; p < pages.length; p++) {
    merge('users/' + uid + '/pages/' + pages[p], { status: 'memorized', weaknessRating: 4, dateMemorized: new Date(local(dayId, 12, 0)).toISOString() });
  }
  sofar = sofar.concat(pages);
  memorizedBy[dayId] = sofar.slice();
  set('users/' + uid + '/memorizations/' + dayId, {
    id: dayId,
    uid: uid,
    day: dayId,
    occurredAt: local(dayId, 12, 0),
    pages: pages,
    source: 'manual',
    minutes: 15 * pages.length,
    recordings: [],
  });
}
if (next !== 581) throw new Error('Juz 30 is 23 pages; the seed memorized ' + (604 - next));
function memorizedOn(dayId) {
  var have = [];
  for (var d in memorizedBy) if (d <= dayId && memorizedBy[d].length > have.length) have = memorizedBy[d];
  return have;
}

// ── Revisions: 11 of the last 14 days, five pages each ─────────────────────
// [day, hour, minute, minutes, weak, moderate]: the five pages are the oldest memorized by the day before, in turn.
var REVISED = [
  ['2026-11-03', 20, 30, 12], ['2026-11-04', 20, 45, 11], ['2026-11-05', 6, 10, 9], ['2026-11-07', 21, 0, 13, [589]],
  ['2026-11-08', 20, 15, 12], ['2026-11-10', 6, 5, 8], ['2026-11-11', 20, 40, 12, [589], [595]], ['2026-11-12', 21, 5, 14],
  ['2026-11-14', 6, 20, 9], ['2026-11-15', 20, 30, 11], ['2026-11-16', 19, 45, 10],
];
var turn = 0;
for (var r = 0; r < REVISED.length; r++) {
  var row = REVISED[r];
  var day = row[0];
  var prev = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) - 1)).toISOString().slice(0, 10);
  var pool = memorizedOn(prev);
  var assigned = [];
  for (var k = 0; k < 5; k++) assigned.push(pool[(turn + k) % pool.length]);
  turn += 5;
  var weak = row[4] || [];
  var moderate = row[5] || [];
  for (var x = 0; x < weak.concat(moderate).length; x++) {
    var extra = weak.concat(moderate)[x];
    if (assigned.indexOf(extra) < 0) assigned[assigned.length - 1 - x] = extra;
  }
  var start = local(day, row[1], row[2]);
  var end = start + row[3] * 60000;
  set('users/' + uid + '/revisions/' + day, {
    id: day,
    uid: uid,
    day: day,
    occurredAt: start,
    countsFor: day,
    source: 'session',
    pages: assigned,
    skipped: [],
    assigned: assigned,
    minutes: row[3],
    recordings: [],
  });
  var updates = [];
  for (var w = 0; w < weak.length; w++) updates.push({ pageNumber: weak[w], previousRating: 3, newRating: 2, changedAt: ts(start + 60000) });
  for (var md = 0; md < moderate.length; md++) updates.push({ pageNumber: moderate[md], previousRating: 4, newRating: 3, changedAt: ts(start + 60000) });
  set('users/' + uid + '/sessions/' + day, {
    id: day,
    date: day,
    state: 'completed',
    createdAt: ts(start),
    updatedAt: ts(end),
    completedAt: ts(end),
    durationMinutes: row[3],
    assignedPages: assigned,
    totalAssignedPages: assigned.length,
    pagesRevised: assigned,
    pagesSkipped: [],
    weaknessUpdates: updates,
    completionPercentage: 100,
  });
}

// The app is still making the account when this runs: sign-up writes its 604 pages in two batches. The seed
// waits until all 604 are on the server. #217's iOS run 42662790506 met both sides of that race in
// 09-activity-light: the seed's commit, while sign-up was still writing, got 409 "Transaction lock
// timeout"; on the retry the seed went through, the relaunch then cut sign-up's second batch short, and the
// app's repair of the 19 missing pages held the emulator's locks for 40 s while Activity waited on them.
// A 409 is tried again after a pause, as seed-history.js does (Maestro's scripts have no timers: the pause
// is a wait on the clock).
function pause(ms) {
  var until = Date.now() + ms;
  while (Date.now() < until) {
    /* waiting */
  }
}
function pagesOnServer() {
  var count = 0;
  var token = '';
  do {
    var url = ROOT + '/users/' + uid + '/pages?pageSize=300&mask.fieldPaths=status' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    var res = http.get(url, { headers: admin });
    if (res.status >= 300) throw new Error('could not list the pages: HTTP ' + res.status + ' ' + res.body);
    var body = json(res.body);
    count += (body.documents || []).length;
    token = body.nextPageToken || '';
  } while (token);
  return count;
}
var PAGES = 604;
var have = pagesOnServer();
for (var waited = 0; have < PAGES; waited += 2000) {
  if (waited >= 90000) throw new Error('the account has ' + have + ' of its ' + PAGES + ' pages on the server after 90 s');
  pause(2000);
  have = pagesOnServer();
}
// Firestore takes at most 500 writes a commit.
for (var c = 0; c < writes.length; c += 400) {
  var body = JSON.stringify({ writes: writes.slice(c, c + 400) });
  for (var attempt = 1; ; attempt++) {
    var commit = http.post(ROOT + ':commit', { headers: admin, body: body });
    if (commit.status < 300) break;
    if (commit.status !== 409 || attempt >= 8) throw new Error('seed commit failed: HTTP ' + commit.status + ' ' + commit.body);
    pause(1500 * attempt);
  }
}
console.log('seeded ' + writes.length + ' documents of a young account for ' + output.email + ' (' + uid + ')');
