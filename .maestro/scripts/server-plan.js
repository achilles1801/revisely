// Maestro runScript (runs in Maestro, on this computer): gives the flow's account (output.email) a plan of its own, as an
// admin in the Firestore emulator: one day holding the pages in DAYS (comma-separated, e.g. "379,380"), every day, from
// START (YYYY-MM-DD, the flow's clock day). The app hears it through the user document's listener, as if the plan editor
// had saved it. E2E_AUTH_URL and E2E_FIRESTORE_URL point at the emulators (default firebase.json's ports); "Bearer owner"
// is the emulators' admin token.
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

var pages = String(DAYS).split(',').map(function (p) { return p.trim(); }).filter(Boolean);
// Stored as the app writes it (lib/schedulePersistence): each day a map of its pages (Firestore holds no arrays of arrays).
var day = { mapValue: { fields: { pages: { arrayValue: { values: pages.map(function (p) { return { integerValue: String(Number(p)) }; }) } } } } };
var plan = {
  mapValue: {
    fields: {
      days: { arrayValue: { values: [day] } },
      cycleStartDate: { stringValue: String(START) },
      direction: { stringValue: 'forward' },
    },
  },
};
var res = http.request(DOCS + 'users/' + uid + '?updateMask.fieldPaths=customPlan', {
  method: 'PATCH',
  headers: admin,
  body: JSON.stringify({ fields: { customPlan: plan } }),
});
if (res.status !== 200) throw new Error('PATCH users/' + uid + ': ' + res.status + ' ' + res.body);
console.log('plan: pages ' + pages.join(', ') + ' every day from ' + START);
