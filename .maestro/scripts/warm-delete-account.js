// Maestro runScript (runs in Maestro, on this computer): the real deleteUserAccount, run once as a
// throwaway account of its own, before the flow deletes its account through the app. The emulator
// runs each function in a worker of its own, and a worker's start and first signed-in call are slow
// on a CI macOS runner: on iOS, run 42423019809, the worker missed the emulator's start limit and
// the app's call was never answered; the next run's call took 15.6 s. The app's call would count
// that against "Account deleted". The worker keeps what it loaded for the job's later calls (it goes
// only when functions/ changes). Anything but { ok: true }, with the throwaway account gone, fails
// the step. E2E_AUTH_URL and E2E_FUNCTIONS_URL point at the emulators (default firebase.json's
// ports). "Bearer owner" is the emulators' admin token; they accept nothing else.
var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FUNCTIONS = typeof E2E_FUNCTIONS_URL !== 'undefined' && E2E_FUNCTIONS_URL ? E2E_FUNCTIONS_URL : 'http://127.0.0.1:5001';
var PROJECT = 'demo-revisely';

var email = 'e2e-warm' + Date.now() + '@example.com';
var signUp = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-e2e-not-a-key', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: email, password: 'e2e-password', returnSecureToken: true }),
});
var idToken = json(signUp.body).idToken;
if (!idToken) throw new Error('warm deleteUserAccount: sign-up failed: ' + signUp.status);

// As the app calls it: the ID token and an App Check token only the emulator accepts
// (src/lib/e2e/functions.ts, as scripts/server-revo.js sends it).
var appCheck = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxOjEyMzQ1Njc4OTAxMjppb3M6ZTJlIn0.';
var started = Date.now();
var res = http.post(FUNCTIONS + '/' + PROJECT + '/us-central1/deleteUserAccount', {
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken, 'X-Firebase-AppCheck': appCheck },
  body: JSON.stringify({ data: {} }),
});
if (res.status !== 200 || (json(res.body).result || {}).ok !== true) {
  throw new Error('warm deleteUserAccount: ' + res.status + ' ' + res.body);
}

var lookup = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: [email] }),
});
if ((json(lookup.body).users || []).length !== 0) throw new Error('warm deleteUserAccount: the throwaway account is still there');
console.log('warm-delete-account: deleteUserAccount in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
