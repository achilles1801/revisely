// Maestro runScript: makes the flow's account a preview tester (ON "true") or not ("false"), as
// set-preview-tester.js does for a real account. Activity's Insights are for testers while they are built
// (ACT-3). Writes through the Firestore emulator as its admin ("Bearer owner"); a 409 (the running app holding
// the document) is tried again after a pause, as seed-history.js does.
var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
var PROJECT = 'demo-revisely';
var admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
var on = (typeof ON !== 'undefined' ? ON : 'true') === 'true';

var lookup = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
  headers: admin,
  body: JSON.stringify({ email: [output.email] }),
});
var users = json(lookup.body).users || [];
if (users.length !== 1) throw new Error('no account for ' + output.email + ' in the Auth emulator');
var doc = FIRESTORE + '/v1/projects/' + PROJECT + '/databases/(default)/documents/users/' + users[0].localId;
function pause(ms) {
  var until = Date.now() + ms;
  while (Date.now() < until) {
    /* waiting */
  }
}
for (var attempt = 1; ; attempt++) {
  var res = http.request(doc + '?updateMask.fieldPaths=previewTester', {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ fields: { previewTester: { booleanValue: on } } }),
  });
  if (res.status < 300) break;
  if (res.status !== 409 || attempt >= 8) throw new Error('could not set previewTester: HTTP ' + res.status + ' ' + res.body);
  pause(1500 * attempt);
}
console.log('previewTester ' + on + ' for ' + output.email);
