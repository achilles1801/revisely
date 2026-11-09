// Maestro runScript (runs in Maestro, on this computer): fills the flow's new account with the Activity
// history the mocks show (activity-redesign/png: d1 Tuesday 3 November, d2 Sunday 1 November, d3
// October, d4 Insights), so each screenshot can be put beside its mock (scripts/verify/activity-boards.py)
// and differ only where the app decided otherwise. Writes through the Auth and Firestore emulators as
// their admin ("Bearer owner"), as server-session.js reads them. The account is output.email
// (subflows/signup.yaml). The recordings are the app's own (src/lib/e2e/demoRecordings.ts, set
// "activity"): a flow can't put files on the phone.
//
// What it writes:
//   - the account: previewTester, 20 pages a day, the Fajr boundary on at Chicago, recording backup off,
//     Smart Tracking on (Weak spots and its "See all pages by strength" need the ratings, ACT-12);
//   - 305 memorized pages, half the Quran: Juz 1–6, 21–28 and 30, and p. 562 (memorized on 3 November:
//     Juz 29 is being learned). Rated weak: 548–549 and 40–41; moderate: 544, 551, 553, 559 (d1);
//   - a revision item and its session for every day revised since 9 September: Juz 4 last on 23
//     September (41 days before 3 November) and Juz 5 on 1 October (33 days), Juz 24–28 within the
//     last 7 days, the rest within 30 (d4's tiles); 556–557 skipped on 12 and 25 October and 3 November
//     (d1, d4), and 548–549 rated weak by three sessions in 30 days; dawn and night sessions (minutes by
//     hour, "Mostly 5–7 AM, then 9–10 PM"); 1.8 minutes a page in the 30 days, 2.1 before (Pace);
//   - October as d3 shows it: 26 days revised (4, 12, 19 and 25 in part), 9 pages memorized, 10 days
//     read (4 h 10 min), 14 days with a note; 9, 10, 17, 24 and 30 not revised;
//   - Sunday 1 November (d2): Juz 27, 6 of 20 revised in 9 minutes, a note;
//   - Tuesday 3 November (d1): Juz 28, 18 of 20 revised in 34 minutes (556–557 skipped), a note tagged
//     to it and a revision written by hand; p. 562 memorized in 25 minutes, with a note; a timed read
//     of 562–563 from 8:05 to 8:23 (its session too, for d7's "From your reading"); a note of its own;
//   - eleven months of memorizing before October (Insights' Memorization bars).
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
  dailyPageCapacity: 20,
  fajrBoundaryEnabled: true,
  locationCoords: { latitude: 41.8781, longitude: -87.6298 },
  recordingBackup: false,
});

// ── Memorized pages: 305 ───────────────────────────────────────────────────
var JUZ = {};
var STARTS = [1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 202, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];
for (var j = 1; j <= 30; j++) JUZ[j] = range(STARTS[j - 1], j === 30 ? 604 : STARTS[j] - 1);
var MEMORIZED_JUZ = [1, 2, 3, 4, 5, 6, 21, 22, 23, 24, 25, 26, 27, 28, 30];
var WEAK = [548, 549, 40, 41];
var MODERATE = [544, 551, 553, 559];
for (var m = 0; m < MEMORIZED_JUZ.length; m++) {
  var pagesOfJuz = JUZ[MEMORIZED_JUZ[m]];
  for (var q = 0; q < pagesOfJuz.length; q++) {
    var page = pagesOfJuz[q];
    var rating = WEAK.indexOf(page) >= 0 ? 2 : MODERATE.indexOf(page) >= 0 ? 3 : 4;
    merge('users/' + uid + '/pages/' + page, { status: 'memorized', weaknessRating: rating, dateMemorized: '2026-01-15T12:00:00.000Z' });
  }
}
merge('users/' + uid + '/pages/562', { status: 'memorized', weaknessRating: 4, dateMemorized: '2026-11-03T18:00:00.000Z' });

// ── Revisions: an item and its session per day ─────────────────────────────
/**
 * One revision day. `o`: juz (one or more), revised (count of the assigned, in order, or a list),
 * skipped (pages skipped; the rest not revised were not reached), minutes, at [hour, minute],
 * weak and moderate (pages the session rated 2 and 3). The app takes each page's rating from the
 * sessions (the last one that rated it), so the ratings the pages show come from here.
 */
function day(dayId, o) {
  var juzList = typeof o.juz === 'number' ? [o.juz] : o.juz;
  var assigned = [];
  for (var a = 0; a < juzList.length; a++) assigned = assigned.concat(JUZ[juzList[a]]);
  var skipped = o.skipped || [];
  var revised =
    typeof o.revised === 'number'
      ? without(assigned, skipped).slice(0, o.revised)
      : o.revised || without(assigned, skipped);
  var start = local(dayId, o.at[0], o.at[1]);
  var minutes = o.minutes === undefined ? null : o.minutes;
  var weak = o.weak || [];
  var moderate = o.moderate || [];
  set('users/' + uid + '/revisions/' + dayId, {
    id: dayId,
    uid: uid,
    day: dayId,
    occurredAt: start,
    countsFor: dayId,
    source: 'session',
    pages: revised,
    skipped: skipped,
    assigned: assigned,
    minutes: minutes,
    recordings: [],
  });
  var updates = [];
  for (var w = 0; w < weak.length; w++) updates.push({ pageNumber: weak[w], previousRating: 3, newRating: 2, changedAt: ts(start + 60000) });
  for (var md = 0; md < moderate.length; md++) updates.push({ pageNumber: moderate[md], previousRating: 4, newRating: 3, changedAt: ts(start + 60000) });
  var end = start + (minutes || 30) * 60000;
  set('users/' + uid + '/sessions/' + dayId, {
    id: dayId,
    date: dayId,
    state: 'completed',
    createdAt: ts(start),
    updatedAt: ts(end),
    completedAt: ts(end),
    durationMinutes: minutes,
    assignedPages: assigned,
    totalAssignedPages: assigned.length,
    pagesRevised: revised,
    pagesSkipped: skipped,
    weaknessUpdates: updates,
    completionPercentage: Math.round((revised.length / assigned.length) * 100),
  });
}

// September: the 30 days before Pace's window (2.1 minutes a page), and Juz 4's last revision on the 23rd.
var SEPTEMBER = [
  [9, 21], [10, 22], [11, 23], [12, 24], [14, 25], [15, 26], [16, 27], [17, 28], [18, 30], [19, 1], [21, 2],
  [22, 3], [23, 4], [24, 5], [25, 6], [26, 21], [28, 22], [29, 23], [30, 24],
];
for (var s = 0; s < SEPTEMBER.length; s++) {
  var sd = '2026-09-' + pad(SEPTEMBER[s][0]);
  var sj = SEPTEMBER[s][1];
  // Al-Baqarah 40–41 rated weak here, outside the 30 days (Weak spots: "Weak now", no count).
  day(sd, { juz: sj, minutes: Math.round(JUZ[sj].length * (s % 2 === 0 ? 2.05 : 2.15)), at: [5, 30], weak: sj === 2 ? [40, 41] : [] });
}

// October and November. Dawn sessions start between 5:20 and 6:05, night ones at 9:05 PM.
day('2026-10-01', { juz: 5, minutes: 42, at: [5, 30] });
day('2026-10-02', { juz: 6, minutes: 41, at: [5, 30] });
day('2026-10-03', { juz: 21, minutes: 43, at: [5, 30] });
day('2026-10-04', { juz: 22, revised: 15, minutes: 32, at: [5, 30] });
day('2026-10-05', { juz: 23, minutes: 36, at: [5, 40] });
day('2026-10-06', { juz: 1, minutes: 38, at: [21, 5] });
day('2026-10-07', { juz: 2, minutes: 37, at: [5, 50] });
day('2026-10-08', { juz: 3, minutes: 35, at: [5, 55] });
day('2026-10-11', { juz: 30, at: [6, 0] }); // no minutes: Pace counts 24 timed revisions
day('2026-10-12', { juz: 28, revised: 17, skipped: [556, 557], minutes: 31, at: [21, 5], weak: [548, 549] });
day('2026-10-13', { juz: 6, minutes: 36, at: [5, 45] });
day('2026-10-14', { juz: 21, minutes: 35, at: [5, 50] });
day('2026-10-15', { juz: 22, minutes: 37, at: [21, 5] });
day('2026-10-16', { juz: 23, minutes: 36, at: [5, 50] });
day('2026-10-18', { juz: 1, minutes: 38, at: [21, 5] });
day('2026-10-19', { juz: 24, revised: 14, minutes: 26, at: [5, 35] });
day('2026-10-20', { juz: 2, minutes: 36, at: [5, 55] });
day('2026-10-21', { juz: 3, minutes: 35, at: [21, 5] });
day('2026-10-22', { juz: 30, minutes: 41, at: [5, 40] });
day('2026-10-23', { juz: 25, minutes: 36, at: [5, 55] });
day('2026-10-25', { juz: 28, revised: 13, skipped: [556, 557], minutes: 24, at: [5, 50], weak: [548, 549] });
day('2026-10-26', { juz: 26, minutes: 36, at: [21, 5] });
day('2026-10-27', { juz: 27, minutes: 37, at: [5, 45] });
day('2026-10-28', { juz: 24, minutes: 31, at: [6, 5] });
day('2026-10-29', { juz: 28, minutes: 36, at: [21, 5] });
day('2026-10-31', { juz: [25, 26], minutes: 72, at: [5, 30] });
day('2026-11-01', { juz: 27, revised: 6, minutes: 9, at: [5, 50] });
day('2026-11-02', { juz: 27, minutes: 36, at: [5, 40] });
day('2026-11-03', { juz: 28, skipped: [556, 557], minutes: 34, at: [21, 5], weak: [548, 549], moderate: MODERATE });

// ── Memorized items: eleven months, then October's nine pages and 3 November ──
function memorization(dayId, pages, minutes) {
  set('users/' + uid + '/memorizations/' + dayId, {
    id: dayId,
    uid: uid,
    day: dayId,
    occurredAt: local(dayId, 12, 0),
    pages: pages,
    source: 'manual',
    minutes: minutes || null,
    recordings: [],
  });
}
var MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
var PER_MONTH = [4, 3, 5, 4, 7, 7, 5, 5, 5, 5, 5];
var nextPage = 402;
for (var mo = 0; mo < MONTHS.length; mo++) {
  memorization(MONTHS[mo] + '-15', range(nextPage, nextPage + PER_MONTH[mo] - 1));
  nextPage += PER_MONTH[mo];
}
var MEMORIZED_ON = [2, 6, 8, 13, 15, 20, 22, 27, 29];
for (var mi = 0; mi < MEMORIZED_ON.length; mi++) memorization('2026-10-' + pad(MEMORIZED_ON[mi]), [113 + mi]);
memorization('2026-11-03', [562], 25);

// ── Reads: October's ten (4 h 10 min), and 3 November's timed read ─────────
function read(dayId, pages, minutes, at) {
  set('users/' + uid + '/reads/read-' + dayId, {
    id: 'read-' + dayId,
    uid: uid,
    day: dayId,
    occurredAt: at,
    pages: pages,
    minutes: minutes,
    source: 'automatic',
    recordings: [],
  });
}
// [day, pages, minutes, hour, minute]: spread over the day, each across an hour's turn.
var READS = [
  [2, range(562, 565), 26, 12, 48], [3, range(566, 569), 26, 16, 48], [9, range(562, 565), 25, 13, 48],
  [11, range(566, 569), 25, 7, 48], [16, range(570, 573), 25, 11, 48], [18, range(574, 577), 25, 15, 48],
  [23, range(578, 581), 25, 19, 48], [28, range(562, 567), 22, 20, 15], [30, range(562, 565), 25, 14, 48],
  [31, range(566, 569), 26, 10, 48],
];
for (var r = 0; r < READS.length; r++) {
  var rd = '2026-10-' + pad(READS[r][0]);
  read(rd, READS[r][1], READS[r][2], local(rd, READS[r][3], READS[r][4]));
}
var READ_AT = local('2026-11-03', 8, 5);
read('2026-11-03', [562, 563], 18, READ_AT);
set('users/' + uid + '/readingSessions/read-2026-11-03', {
  date: '2026-11-03',
  startedAt: ts(READ_AT),
  endedAt: ts(READ_AT + 18 * 60000),
  durationSeconds: 18 * 60,
  mode: 'stopwatch',
  targetSeconds: null,
  pages: [562, 563],
  pagesVisited: [562, 563],
  createdAt: ts(READ_AT + 18 * 60000),
  updatedAt: ts(READ_AT + 18 * 60000),
});

// ── Notes ───────────────────────────────────────────────────────────────────
function note(dayId, id, text, at, tag, kind, minutes) {
  var entry = { id: id, uid: uid, day: dayId, at: at, kind: kind || 'note', text: text, minutes: minutes || null };
  if (tag) entry.tag = tag;
  set('users/' + uid + '/journal/' + dayId + '/entries/' + id, entry);
}
var NOTE_ON = [1, 3, 5, 7, 12, 14, 17, 19, 21, 25, 26, 28, 29, 31];
for (var n = 0; n < NOTE_ON.length; n++) {
  var nd = '2026-10-' + pad(NOTE_ON[n]);
  note(nd, 'note-' + nd, 'Read Al-Mulk twice before Fajr.', local(nd, 15, 0), null);
}
note('2026-11-01', 'note-d2', 'Guests tonight. Picking up from At-Tur tomorrow.', local('2026-11-01', 20, 20), null);
note('2026-11-03', 'note-d1', '548–549 keep slipping at the turn. Read them twice before Fajr.', local('2026-11-03', 21, 40), 'revision:2026-11-03');
note('2026-11-03', 'hand-d1', 'Ya-Sin, p. 440–445', local('2026-11-03', 6, 10), null, 'revision', 12);
note('2026-11-03', 'note-d1-mem', 'Two sittings. Ayah 10 needs work.', local('2026-11-03', 19, 10), 'memorization:2026-11-03');
note('2026-11-03', 'note-d1-own', 'First half on the train, the rest after work.', local('2026-11-03', 13, 5), null);

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
console.log('seeded ' + writes.length + ' documents of Activity history for ' + output.email + ' (' + uid + ')');
