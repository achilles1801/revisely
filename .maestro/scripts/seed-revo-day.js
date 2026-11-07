// Maestro runScript: gives one day of the Revo mocks' history (Tue 27 October, scripts/seed-revo.js)
// everything Add to chat's day preview shows (mock a4): ratings in its session, a timed read and two
// notes in its daily log, so the board shows every row of the preview. Writes through the Firestore
// emulator as its admin, in one commit. Run after seed-revo.js; the ratings are the pages' own
// (551 moderate, 555–557 strong), so nothing else the flows show changes.
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
var users = JSON.parse(lookup.body).users || [];
if (users.length !== 1) throw new Error('no account for ' + output.email + ' in the Auth emulator');
var uid = users[0].localId;

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
function merge(path, data) {
  var mask = [];
  for (var k in data) mask.push(k);
  writes.push({ update: { name: NAME + path, fields: fv(data).mapValue.fields }, updateMask: { fieldPaths: mask } });
}
function set(path, data) {
  writes.push({ update: { name: NAME + path, fields: fv(data).mapValue.fields } });
}

var DAY = '2026-10-27';
var NOON = Date.UTC(2026, 9, 27, 17, 0); // 12:00 in Chicago (CDT)
var ratings = [[551, 3], [555, 4], [556, 4], [557, 4]];
var updates = [];
for (var r = 0; r < ratings.length; r++) {
  updates.push({ pageNumber: ratings[r][0], previousRating: ratings[r][1], newRating: ratings[r][1], changedAt: { __ts: NOON } });
}
merge('users/' + uid + '/sessions/' + DAY, { weaknessUpdates: updates });

var readAt = NOON - 2 * 3600000;
set('users/' + uid + '/readingSessions/seed-read-' + DAY, {
  date: DAY,
  startedAt: { __ts: readAt },
  endedAt: { __ts: readAt + 22 * 60000 },
  durationSeconds: 22 * 60,
  mode: 'stopwatch',
  targetSeconds: null,
  pages: [548, 549, 550, 551, 552, 553],
  pagesVisited: [548, 549, 550, 551, 552, 553],
  createdAt: { __ts: readAt + 22 * 60000 },
  updatedAt: { __ts: readAt + 22 * 60000 },
});

var notes = [
  ['seed-note-1', NOON + 3600000, 'The end of Al-Hashr felt shaky after Isha.'],
  ['seed-note-2', NOON + 2 * 3600000, 'Read Al-Hashr 18 to 24 to my teacher; she corrected two places.'],
];
for (var n = 0; n < notes.length; n++) {
  set('users/' + uid + '/journal/' + DAY + '/entries/' + notes[n][0], {
    id: notes[n][0],
    uid: uid,
    day: DAY,
    at: notes[n][1],
    kind: 'note',
    text: notes[n][2],
    minutes: null,
  });
}

var commit = http.post(ROOT + ':commit', { headers: admin, body: JSON.stringify({ writes: writes }) });
if (commit.status >= 300) throw new Error('seed commit failed: HTTP ' + commit.status + ' ' + commit.body);
console.log('seeded ' + writes.length + ' documents for ' + DAY + ' (' + uid + ')');
