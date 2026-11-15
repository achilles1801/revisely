# metrics.revisely.app → Revisely Console

Majd, Nov 14 2026: one console ("why would we need two separate dashboards"). Production's Hosting site
(revision-buddy-3a398: metrics.revisely.app, revision-buddy-3a398.web.app, .firebaseapp.com) now only redirects to
https://revisely-dev.web.app, which shows production and dev (CLAUDE.md, "Revisely Console").

Deploy (production, by hand):

```bash
firebase deploy --config scripts/metrics/metrics-redirect/firebase.json --project revision-buddy-3a398 --only hosting
```

Never deploy the root `firebase.json`'s hosting (`admin/`) to production: that brings the second dashboard back.
The redirect leaves Firebase's reserved `/__/` paths alone (its regex skips them): the sign-in handler and
`/__/firebase/init.json` keep answering, which revisely.app's account pages will read through the Worker once they are on
in production (`FIREBASE_HOSTING`). A plain `**` redirect caught `init.json` too.

Undo: Firebase console → Hosting → revision-buddy-3a398 → release history → roll back to version
`c84cf5058308de81` (the old metrics page, Nov 11 2026).
