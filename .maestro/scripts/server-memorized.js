// Maestro runScript (runs in Maestro, on this computer): marks the pages in PAGES (comma-separated, e.g. "379")
// memorized on the flow's account (output.email), in the Firestore emulator, as an admin. The app hears it through its
// pages listener, as if the Memorized pages screen had saved it. E2E_AUTH_URL and E2E_FIRESTORE_URL point at the
// emulators (default firebase.json's ports); "Bearer owner" is the emulators' admin token.
var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
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

var pages = String(PAGES).split(',').map(function (p) { return p.trim(); }).filter(Boolean);
for (var i = 0; i < pages.length; i++) {
  var path = 'users/' + uid + '/pages/' + pages[i];
  var res = http.request(DOCS + path + '?updateMask.fieldPaths=status', {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ fields: { status: { stringValue: 'memorized' } } }),
  });
  if (res.status !== 200) throw new Error('PATCH ' + path + ': ' + res.status + ' ' + res.body);
}
console.log('memorized: pages ' + pages.join(', '));
