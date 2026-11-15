// Maestro runScript (runs in Maestro, on this computer): devGrantPremium and devRevokePremium once each, as a throwaway
// account made here for it, before flow 18's own "Get Premium" and Settings → Testing → Premium, so those calls find the
// functions' workers started. Their first signed-in call on a CI macOS runner passed the app's 20 s (setDevPremium) on
// iOS in run 43687556122 (PR #607): "Couldn't turn on Premium · Couldn't connect", and the flow waited for the Premium
// page to close in vain. Run 2 of the same job passed. As warm-delete.js: a call without an ID token doesn't start the
// worker, and a throwaway account keeps the flow's own account as it is. Nothing is checked here.
// E2E_AUTH_URL and E2E_FUNCTIONS_URL point at the emulators.
var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FUNCTIONS = typeof E2E_FUNCTIONS_URL !== 'undefined' && E2E_FUNCTIONS_URL ? E2E_FUNCTIONS_URL : 'http://127.0.0.1:5001';
var PROJECT = 'demo-revisely';

var signUp = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-e2e-not-a-key', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'e2e-warm-premium' + Date.now() + '@example.com', password: 'e2e-password', returnSecureToken: true }),
});
var idToken = json(signUp.body).idToken;
if (!idToken) throw new Error('warm-premium: sign-up failed: ' + signUp.status);
// An App Check token only the emulator accepts (src/lib/e2e/functions.ts), as server-revo.js sends.
var appCheck = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxOjEyMzQ1Njc4OTAxMjppb3M6ZTJlIn0.';
['devGrantPremium', 'devRevokePremium'].forEach(function (fn) {
  var started = Date.now();
  try {
    var res = http.post(FUNCTIONS + '/' + PROJECT + '/us-central1/' + fn, {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken, 'X-Firebase-AppCheck': appCheck },
      body: JSON.stringify({ data: {} }),
    });
    console.log('warm-premium: ' + fn + ' answered ' + res.status + ' in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
  } catch (err) {
    console.log('warm-premium: ' + fn + ' gave no answer after ' + ((Date.now() - started) / 1000).toFixed(1) + ' s (' + err + ')');
  }
});
