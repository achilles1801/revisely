// Maestro runScript (runs in Maestro, on this computer): Revo's server side for 09-revo, against the
// emulators, as an admin or the app would set it. The account is output.email (subflows/signup.yaml).
//   MODE=warm    the Revo functions the flow waits on, run once each before any step waits on them,
//                as the account (a tester, Revo still off), changing nothing: revoSetOptions with no
//                change only reads, revoDayInReview and revoAsk are refused once they have read that
//                Revo is off. The emulator runs each function in a worker of its own, and a worker's
//                first signed-in call is slow on a CI macOS runner: 17–22 s (run 42403200017: the
//                app's first revoSetOptions 17.5 s, revoDayInReview 17.2 s, revoAsk 21.9 s; later
//                calls 2–5 s), longer than a step's wait. A call without an ID token didn't help:
//                refused before the token checks and Firestore, it left that cost to the app's call.
//                The worker keeps it for the job's later calls (it goes only when functions/ changes)
//   MODE=tester  marks it a previewTester (functions/scripts/set-preview-tester.js does this in
//                production; clients can't write the field)
//   MODE=reply   the model's next answers for this account: REPLY (its text, inside the recorded
//                reply; functions/src/emulator.ts)
//   MODE=limit   today's questions used: revoUsage for DAY at COUNT (20 unless given), as revoAsk
//                counts them
//   MODE=off     Revo turned off: the real revoSetOptions, called as Settings → Revo AI calls it
//                (it deletes the account's Revo conversations and memory)
//   MODE=review  tonight's Day in review: the real revoDayInReview function, called as the app calls
//                it (the account's ID token, an App Check token the emulator accepts, the flow's
//                clock), for DAY with four pages revised
// E2E_AUTH_URL, E2E_FIRESTORE_URL and E2E_FUNCTIONS_URL point at the emulators (default firebase.json's
// ports). "Bearer owner" is the emulators' admin token; they accept nothing else.
var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
var FUNCTIONS = typeof E2E_FUNCTIONS_URL !== 'undefined' && E2E_FUNCTIONS_URL ? E2E_FUNCTIONS_URL : 'http://127.0.0.1:5001';
var PROJECT = 'demo-revisely';
var DOCS = FIRESTORE + '/v1/projects/' + PROJECT + '/databases/(default)/documents/';
var admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

var lookup = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
  headers: admin,
  body: JSON.stringify({ email: [output.email] }),
});
var users = json(lookup.body).users || [];
if (users.length !== 1) throw new Error('no account for ' + output.email + ' in the Auth emulator');
var uid = users[0].localId;

function patch(path, fields) {
  var mask = Object.keys(fields).map(function (k) { return 'updateMask.fieldPaths=' + k; }).join('&');
  var res = http.request(DOCS + path + '?' + mask, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: fields }) });
  if (res.status !== 200) throw new Error('PATCH ' + path + ': ' + res.status + ' ' + res.body);
}

/** One of our callables, as the app calls it: the account's ID token, an App Check token only the
 * emulator accepts (src/lib/e2e/functions.ts), and the flow's clock. */
function callable(name, data, nowMs) {
  var signIn = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-e2e-not-a-key', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: output.email, password: 'e2e-password', returnSecureToken: true }),
  });
  var idToken = json(signIn.body).idToken;
  if (!idToken) throw new Error('sign-in failed: ' + signIn.status);
  var appCheck = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxOjEyMzQ1Njc4OTAxMjppb3M6ZTJlIn0.';
  return http.post(FUNCTIONS + '/' + PROJECT + '/us-central1/' + name, {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken, 'X-Firebase-AppCheck': appCheck, 'X-Revisely-Test-Now': String(nowMs) },
    body: JSON.stringify({ data: data }),
  });
}

if (MODE === 'warm') {
  // What each answers with Revo off: the settings (200), or "Turn Revo on first." (403) once its
  // gate has read the account (functions/src/revo/handler.ts). Anything else (not a tester, an
  // error) fails the step.
  [['revoSetOptions', 200], ['revoDayInReview', 403], ['revoAsk', 403]].forEach(function (call) {
    var started = Date.now();
    var res = callable(call[0], {}, Date.now());
    var ok = res.status === call[1] && (call[1] === 200 ? (json(res.body).result || {}).optIn === false : /Turn Revo on first/.test(res.body));
    if (!ok) throw new Error('warm ' + call[0] + ': ' + res.status + ' ' + res.body);
    console.log('server-revo: warm ' + call[0] + ' in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
  });
} else if (MODE === 'tester') {
  patch('users/' + uid, { previewTester: { booleanValue: true } });
} else if (MODE === 'reply') {
  patch('emulator/anthropic/accounts/' + uid, { reply: { mapValue: { fields: { text: { stringValue: REPLY } } } } });
} else if (MODE === 'limit') {
  var count = typeof COUNT !== 'undefined' && COUNT !== '' ? String(Number(COUNT)) : '20';
  patch('revoUsage/' + uid, { day: { stringValue: DAY }, count: { integerValue: count } });
} else if (MODE === 'off') {
  var off = callable('revoSetOptions', { optIn: false }, Date.now());
  if (off.status !== 200 || (json(off.body).result || {}).optIn !== false) throw new Error('revoSetOptions: ' + off.status + ' ' + off.body);
} else if (MODE === 'review') {
  var context = {
    totals: { memorizedPages: 24, revisedWithin7Days: 4, revisedWithin30Days: 4, daysWithSession30: 1, streakDays: 0, sessions30: 1,
      weakPages: 0, moderatePages: 0, strongPages: 24, weakRevisedLast7Days: 0, pagesPerDay7: 0.6, pagesPerDay30: 0.1, plannedPerDay: 10 },
    today: { plannedPages: 10, revisedPages: 4, minutes: 18, memorizedPages: 0, nextPages: [584, 585, 586, 587, 588, 589], weakNext: [], done: false },
    weakPages: [],
    week: [{ day: DAY, pages: 4 }],
    localTime: '21:45',
  };
  var res = callable('revoDayInReview', { day: DAY, context: context }, Date.parse(DAY + 'T23:45:00Z'));
  var result = json(res.body).result || {};
  if (res.status !== 200 || !result.chat) throw new Error('revoDayInReview: ' + res.status + ' ' + res.body);
} else {
  throw new Error('unknown MODE ' + MODE);
}
console.log('server-revo: ' + MODE + ' done');
