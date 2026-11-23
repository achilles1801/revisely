// Maestro runScript: the Memorized picker's account (MEM-8), as its mocks draw it. An-Naml 23–26, the top of page 379,
// are memorized, on the account's latest entry, so the picker opens there with An-Naml 27 next. Written through the
// Auth and Firestore emulators as their admin, as seed-activity.js does. The account is output.email (signup.yaml).

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

var body = JSON.stringify({
  writes: [
    {
      update: {
        name: NAME + 'users/' + users[0].localId + '/pages/379',
        fields: {
          status: { stringValue: 'learning' },
          verses: {
            arrayValue: {
              values: [{ integerValue: '27023' }, { integerValue: '27024' }, { integerValue: '27025' }, { integerValue: '27026' }],
            },
          },
          dateMemorized: { timestampValue: '2026-11-02T18:00:00.000Z' },
        },
      },
      updateMask: { fieldPaths: ['status', 'verses', 'dateMemorized'] },
    },
  ],
});
var commit = http.post(ROOT + ':commit', { headers: admin, body: body });
if (commit.status >= 300) throw new Error('seed commit failed: HTTP ' + commit.status + ' ' + commit.body);
console.log('seeded An-Naml 23–26 on page 379 for ' + output.email);
