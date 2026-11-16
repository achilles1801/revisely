// Maestro runScript: takes with Mark mistakes on the flow's new account, for Insights' Recitation section (Revisely
// Dev, RINS-2; the end of flow 09-revo-attach). Today is Monday 16 November 2026 (the flow's CLOCK). Writes through the
// emulators as their admin ("Bearer owner"), as seed-history.js does.
//   env SMART: "on" (default) or "off": the account's Smart Tracking. With "off" only the account is written again.
//
// What it writes:
//   - the account: previewTester, Smart Tracking; Juz 30 memorized, An-Naba's page rated weak (2) and Al-Infitar's
//     strong (5), so Weak spots and "Rated strong, but slips" have something to name;
//   - users/<uid>/reciteTakes, as the app keeps them (lib/reciteMemory/record.ts toStored), with real word numbers
//     (lib/recite/quranWords):
//       An-Naba 1–16 five times: 35 days ago (the window before), then 12, 8, 3 and 1 days ago; ayah 9's سُبَاتًا said
//         wrong three times, ayah 10's لِبَاسًا skipped once, ayah 14's مَآءً a haraka slip, then only "Not clear";
//       Al-Infitar 1–19 twice (6 and 2 days ago): after ayah 13 (the same words as Al-Mutaffifin 22) the reciter went
//         on with Al-Mutaffifin 23;
//       Al-Falaq 1–5 three times (10, 9 and 4 days ago): ayah 3 ended as ayah 5 ends, then right on two days (cleared).

var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
var PROJECT = 'demo-revisely';
var ROOT = FIRESTORE + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
var NAME = 'projects/' + PROJECT + '/databases/(default)/documents/';
var admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
var SMART_ON = (typeof SMART !== 'undefined' ? SMART : 'on') !== 'off';
var TODAY = '2026-11-16';

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
function before(n) {
  return new Date(Date.parse(TODAY + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
}
/** `hour`:`minute` in Chicago on `day` (CST in November 2026, CDT before 1 November). */
function local(day, hour, minute) {
  var parts = day.split('-');
  var offset = day < '2026-11-01' && day >= '2026-03-08' ? 5 : 6;
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), hour + offset, minute || 0);
}

merge('users/' + uid, { previewTester: true, smartTrackingEnabled: SMART_ON, hasSeenSmartTrackingPreview: true });

if (SMART_ON) {
  merge('users/' + uid + '/pages/1', { status: 'not_memorized', dateMemorized: null });
  for (var p = 582; p <= 604; p++) {
    var rating = p === 582 ? 2 : p === 587 ? 5 : 4;
    merge('users/' + uid + '/pages/' + p, { status: 'memorized', dateMemorized: ts(local(before(60), 12, 0)), weaknessRating: rating });
  }

  // Words (the app's word numbers) and their ayahs.
  var NABA = [75121, 75169];
  var INFITAR = [75710, 75789];
  var FALAQ = [77386, 77408];
  var SUBATA = { w: 75145, sura: 78, ayah: 9 };
  var LIBASA = { w: 75148, sura: 78, ayah: 10 };
  var MAAN = { w: 75162, sura: 78, ayah: 14 };
  var WA_INNA = { w: 75759, sura: 82, ayah: 14 };
  var WAQAB = { w: 77398, sura: 113, ayah: 3 };

  function mark(at, kind, extra) {
    var m = { id: at.w + ':' + kind + ':', w: at.w, sura: at.sura, ayah: at.ayah, kind: kind, sure: 'clear' };
    for (var k in extra || {}) m[k] = extra[k];
    return m;
  }
  var n = 0;
  function take(daysAgo, range, marks, accuracy, hidden) {
    n += 1;
    var day = before(daysAgo);
    var createdAt = local(day, 19, 10 + n);
    var counted = 0;
    var unclear = 0;
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].sure === 'likely' && (marks[i].kind === 'harakat' || marks[i].kind === 'letter')) unclear += 1;
      else if (marks[i].kind !== 'tajweed') counted += 1;
    }
    set('users/' + uid + '/reciteTakes/e2e-take-' + n, {
      v: 1,
      kind: 'take',
      take: null,
      createdAt: createdAt,
      rev: createdAt,
      day: day,
      level: 'words',
      hidden: hidden === true,
      from: range[0],
      to: range[1],
      secs: 60 + (range[1] - range[0]),
      mistakes: counted,
      tajweed: 0,
      unclear: unclear,
      accuracy: accuracy,
      marks: marks,
      passed: [],
      recordingId: null,
      deleted: false,
      updatedAt: ts(Date.now()),
    });
  }
  take(35, NABA, [mark(SUBATA, 'word', { heard: 'سَكَنًا', heardExact: true }), mark(LIBASA, 'skipped'), mark(MAAN, 'harakat')], 0.95);
  take(12, NABA, [mark(SUBATA, 'word', { heard: 'سَكَنًا', heardExact: true }), mark(LIBASA, 'skipped')], 0.984);
  take(8, NABA, [mark(SUBATA, 'word', { heard: 'سَكَنًا', heardExact: true }), mark(MAAN, 'harakat')], 0.984, true);
  take(3, NABA, [mark(SUBATA, 'word', { heard: 'سَكَنًا', heardExact: true })], 0.992);
  take(1, NABA, [mark(MAAN, 'harakat', { sure: 'likely' })], 1);
  // Al-Mutaffifin 23's first word (Maestro's scripts may lack Object.assign: the fields are written out).
  take(6, INFITAR, [mark(WA_INNA, 'word', { heard: 'عَلَى', heardExact: true, detail: 'lookalike', intoW: 75891, intoSura: 83, intoAyah: 23 })], 0.988);
  take(2, INFITAR, [mark(WA_INNA, 'skipped', { intoW: 75891, intoSura: 83, intoAyah: 23 })], 0.988, true);
  take(10, FALAQ, [mark(WAQAB, 'word', { heard: 'حَسَدَ', heardExact: true, intoW: 77408, intoSura: 113, intoAyah: 5, intoEnding: true })], 0.96);
  take(9, FALAQ, [], 1);
  take(4, FALAQ, [], 1);
}

function pause(ms) {
  var until = Date.now() + ms;
  while (Date.now() < until) {
    /* waiting */
  }
}
var body = JSON.stringify({ writes: writes });
for (var attempt = 1; ; attempt++) {
  var commit = http.post(ROOT + ':commit', { headers: admin, body: body });
  if (commit.status < 300) break;
  if (commit.status !== 409 || attempt >= 8) throw new Error('seed commit failed: HTTP ' + commit.status + ' ' + commit.body);
  pause(1500 * attempt);
}
console.log('seeded recitation (' + writes.length + ' documents, Smart Tracking ' + (SMART_ON ? 'on' : 'off') + ') for ' + output.email + ' (' + uid + ')');
