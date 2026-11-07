// Maestro runScript (runs in Maestro, on this computer): Revo's server side for 09-revo, against the
// emulators, as an admin or the app would set it. The account is output.email (subflows/signup.yaml).
//   MODE=tester  marks it a previewTester (functions/scripts/set-preview-tester.js does this in
//                production; clients can't write the field)
//   MODE=reply   the model's next answers for this account: REPLY (its text, inside the recorded
//                reply; functions/src/emulator.ts)
//   MODE=limit   today's questions used: revoUsage for DAY at 20, as revoAsk counts them
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

if (MODE === 'tester') {
  patch('users/' + uid, { previewTester: { booleanValue: true } });
} else if (MODE === 'reply') {
  patch('emulator/anthropic/accounts/' + uid, { reply: { mapValue: { fields: { text: { stringValue: REPLY } } } } });
} else if (MODE === 'limit') {
  patch('revoUsage/' + uid, { day: { stringValue: DAY }, count: { integerValue: '20' } });
} else if (MODE === 'review') {
  var signIn = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-e2e-not-a-key', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: output.email, password: 'e2e-password', returnSecureToken: true }),
  });
  var idToken = json(signIn.body).idToken;
  if (!idToken) throw new Error('sign-in failed: ' + signIn.status);
  // An unsigned token in App Check's shape (src/lib/e2e/functions.ts): only the emulator accepts it.
  var appCheck = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxOjEyMzQ1Njc4OTAxMjppb3M6ZTJlIn0.';
  var context = {
    totals: { memorizedPages: 24, revisedWithin7Days: 4, revisedWithin30Days: 4, daysWithSession30: 1, streakDays: 0, sessions30: 1,
      weakPages: 0, moderatePages: 0, strongPages: 24, weakRevisedLast7Days: 0, pagesPerDay7: 0.6, pagesPerDay30: 0.1, plannedPerDay: 10 },
    today: { plannedPages: 10, revisedPages: 4, minutes: 18, memorizedPages: 0, nextPages: [584, 585, 586, 587, 588, 589], weakNext: [], done: false },
    weakPages: [],
    week: [{ day: DAY, pages: 4 }],
    localTime: '21:45',
  };
  var res = http.post(FUNCTIONS + '/' + PROJECT + '/us-central1/revoDayInReview', {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken, 'X-Firebase-AppCheck': appCheck, 'X-Revisely-Test-Now': String(Date.parse(DAY + 'T23:45:00Z')) },
    body: JSON.stringify({ data: { day: DAY, context: context } }),
  });
  var result = json(res.body).result || {};
  if (res.status !== 200 || !result.chat) throw new Error('revoDayInReview: ' + res.status + ' ' + res.body);
} else {
  throw new Error('unknown MODE ' + MODE);
}
console.log('server-revo: ' + MODE + ' done');
