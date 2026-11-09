// Maestro runScript (runs in Maestro, on this computer): the flow's account as an admin sees it,
// in the Auth emulator and the Firestore emulator. Sets output.accountExists (a sign-in for
// output.email), output.userDocExists (users/<uid>) and output.serverPagesCount (its pages). The
// first call keeps the account's id in output.uid, so a later call can look for its data after
// the sign-in is gone. E2E_AUTH_URL and E2E_FIRESTORE_URL point at the emulators (default
// firebase.json's ports). "Bearer owner" is the emulators' admin token; they accept nothing else.
var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
var PROJECT = 'demo-revisely';
var admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

var lookup = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
  headers: admin,
  body: JSON.stringify({ email: [output.email] }),
});
var users = json(lookup.body).users || [];
output.accountExists = users.length === 1;
if (output.accountExists) output.uid = users[0].localId;
if (!output.uid) throw new Error('no account for ' + output.email + ' in the Auth emulator, and none seen before');

var docs = FIRESTORE + '/v1/projects/' + PROJECT + '/databases/(default)/documents/users/' + output.uid;
output.userDocExists = http.get(docs, { headers: admin }).status === 200;
var pages = http.get(docs + '/pages?pageSize=5', { headers: admin });
output.serverPagesCount = pages.status === 200 ? (json(pages.body).documents || []).length : 0;
console.log('server: sign-in ' + output.accountExists + ', user document ' + output.userDocExists + ', pages (first 5) ' + output.serverPagesCount);
