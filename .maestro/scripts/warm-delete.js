// Maestro runScript (runs in Maestro, on this computer): deleteUserAccount once before the flow's own
// call, as an account made here for it, so the flow's call finds the function's worker started.
// The emulator runs each function in a worker of its own, and its first signed-in call is slow on a
// CI macOS runner: 47 s in run 42594658944 (14.5 s the next time), past the app's 30 s
// (DELETE_ACCOUNT_TIMEOUT_MS), and the app said "The server didn't answer in time". A call without
// an ID token doesn't start it (server-revo.js, MODE=warm). Nothing is checked here: the flow checks
// its own deletion. E2E_AUTH_URL and E2E_FUNCTIONS_URL point at the emulators.
var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FUNCTIONS = typeof E2E_FUNCTIONS_URL !== 'undefined' && E2E_FUNCTIONS_URL ? E2E_FUNCTIONS_URL : 'http://127.0.0.1:5001';
var PROJECT = 'demo-revisely';

var signUp = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-e2e-not-a-key', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'e2e-warm' + Date.now() + '@example.com', password: 'e2e-password', returnSecureToken: true }),
});
var idToken = json(signUp.body).idToken;
if (!idToken) throw new Error('warm-delete: sign-up failed: ' + signUp.status);
// An App Check token only the emulator accepts (src/lib/e2e/functions.ts), as server-revo.js sends.
var appCheck = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxOjEyMzQ1Njc4OTAxMjppb3M6ZTJlIn0.';
var started = Date.now();
try {
  var res = http.post(FUNCTIONS + '/' + PROJECT + '/us-central1/deleteUserAccount', {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken, 'X-Firebase-AppCheck': appCheck },
    body: JSON.stringify({ data: {} }),
  });
  console.log('warm-delete: deleteUserAccount answered ' + res.status + ' in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
} catch (err) {
  console.log('warm-delete: no answer after ' + ((Date.now() - started) / 1000).toFixed(1) + ' s (' + err + ')');
}
