// Maestro runScript (runs in Maestro, on this computer): reads the account's
// session for DAY from the Firestore emulator, the way an admin would, and sets
// output.serverPages to how many pages it has revised (-1 if there's none yet).
// The account is output.email (subflows/signup.yaml). E2E_AUTH_URL and
// E2E_FIRESTORE_URL point at the emulators (default firebase.json's ports).
// "Bearer owner" is the emulators' admin token; they accept nothing else here.
var AUTH = typeof E2E_AUTH_URL !== 'undefined' && E2E_AUTH_URL ? E2E_AUTH_URL : 'http://127.0.0.1:9099';
var FIRESTORE = typeof E2E_FIRESTORE_URL !== 'undefined' && E2E_FIRESTORE_URL ? E2E_FIRESTORE_URL : 'http://127.0.0.1:8080';
var PROJECT = 'demo-revisely';
var admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

var lookup = http.post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
  headers: admin,
  body: JSON.stringify({ email: [output.email] }),
});
var users = json(lookup.body).users || [];
if (users.length !== 1) throw new Error('no account for ' + output.email + ' in the Auth emulator');
var uid = users[0].localId;

var res = http.get(FIRESTORE + '/v1/projects/' + PROJECT + '/databases/(default)/documents/users/' + uid + '/sessions/' + DAY, {
  headers: admin,
});
if (res.status === 404) {
  output.serverPages = -1;
} else {
  var fields = json(res.body).fields || {};
  var values = (fields.pagesRevised && fields.pagesRevised.arrayValue && fields.pagesRevised.arrayValue.values) || [];
  output.serverPages = values.length;
}
console.log('server: ' + DAY + ' has ' + output.serverPages + ' pages revised');
