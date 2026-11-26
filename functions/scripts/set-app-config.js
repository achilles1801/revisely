/**
 * App versions every install reads: Firestore config/app
 * (src/lib/updates/storeUpdates.ts). Clients can only read it (firestore.rules);
 * only this script writes it.
 *
 *   minSupported.ios / .android  Below this, the app shows "Update required",
 *                                with no way past it, once the store has a version
 *                                that meets it (iOS: the App Store listing shows
 *                                it; Android: latest.android is at least it).
 *                                TestFlight and App Review are never blocked.
 *   latest.android (+ .androidCode)  The version (and version code) on Google
 *                                Play's production track, once it is out to
 *                                everyone (Play has no public lookup). Installs
 *                                below it are offered it once ("New version
 *                                available"). iOS reads the App Store's from Apple.
 *   testing.android              Not set here: the playBuildAvailable function
 *                                writes it when android-build.yml has put a build
 *                                on internal testing (offered to previewTester
 *                                accounts only).
 *   revo                         Who has Revo (REVO-37): testers (previewTester
 *                                accounts; the same as unset), everyone (set at the
 *                                production release), or off (nobody, testers
 *                                included: an emergency). The functions apply it
 *                                within a minute; phones at launch, back in front
 *                                after 10 minutes, or at once when the server
 *                                refuses Revo. Turning Revo off and deleting its
 *                                data stay open to every account.
 *   revoRecite                   Whether store phones send Revo the recitation and
 *                                Insights' gaps (the 1.0.5 release; src/lib/revo/
 *                                release revoReciteOn). On only after revoAsk and
 *                                revoDayInReview from the release are deployed:
 *                                older ones refuse both. Revisely Dev always sends them.
 *   revoPatterns                 Whether phones send Revo the patterns in their days
 *                                and each day's facts (REVO-40, src/lib/revo/release
 *                                revoPatternsOn). Turn it on only after revoAsk and
 *                                revoDayInReview with REVO-40 are deployed: older
 *                                functions refuse fields they don't know, so every
 *                                question would fail. Off (unset) stops them, no
 *                                deploy needed. Phones read it with `revo`.
 *   earlyAccess                  Premium early access (PREM-1, functions/src/support/
 *                                early.ts): true while every account set up gets
 *                                Premium for good (earlyAccessOnSignUp; older
 *                                accounts: scripts/early-access.js). Off stops
 *                                new grants; none already given is removed.
 *                                Phones read it to word Premium (lib/premium).
 *   whatsNewOff                  The "What's new" kill switch (src/lib/whatsNew/
 *                                killSwitch.ts): true stops the walkthrough after
 *                                the update for everyone, without an update, in
 *                                case a card turns out wrong. Phones read it at
 *                                launch and back in front after 10 minutes.
 *   reciteCheckOff               The phones' kill switch for mistake detection (the
 *                                release plan, checker-prod.md, "Switching it off"):
 *                                true hides Recite and Mark mistakes, and the mic
 *                                records as before. The checker's own switch is
 *                                PAUSED on its Cloud Run services, which refuses new
 *                                takes within a minute; this one reaches phones as
 *                                whatsNewOff does. Unset: on.
 *   recite.where                 Where takes run (src/lib/reciteLive/where.ts): phone,
 *                                server or auto (the phone when it has the engine and
 *                                passed its speed check). Unset: the server. A take the
 *                                engine can't run goes to the server whatever this says.
 *   ramadan.start / .eid         The Ramadan theme's dates (src/lib/ramadanDates.ts,
 *                                THEME-2): the first day of fasting and Eid al-Fitr,
 *                                YYYY-MM-DD, 29 or 30 days apart. Correct them after
 *                                the moon sighting. Unset: the Umm al-Qura calendar's
 *                                expected dates in the app. Phones read it once a
 *                                launch where the theme is offered, and keep the
 *                                last good value.
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *     node scripts/set-app-config.js --show
 *   ... node scripts/set-app-config.js --latest-android 1.0.4 --latest-android-code 7   # production, rolled out to all
 *   ... node scripts/set-app-config.js --min-ios 1.0.4 --min-android 1.0.4
 *   ... node scripts/set-app-config.js --clear-min               # nobody blocked
 *   ... node scripts/set-app-config.js --revo everyone           # Revo for every account
 *   ... node scripts/set-app-config.js --revo off                # Revo paused for everyone
 *   ... node scripts/set-app-config.js --revo testers            # back to testers only
 *   ... node scripts/set-app-config.js --revo-patterns on        # after deploying revoAsk,revoDayInReview with REVO-40
 *   ... node scripts/set-app-config.js --revo-patterns off       # phones stop sending them
 *   ... node scripts/set-app-config.js --revo-recite on          # after deploying revoAsk,revoDayInReview with the 1.0.5 release
 *   ... node scripts/set-app-config.js --revo-recite off         # store phones stop sending recitation and gaps
 *   ... node scripts/set-app-config.js --whats-new off           # stop the What's new walkthrough
 *   ... node scripts/set-app-config.js --whats-new on            # let it show again
 *   ... node scripts/set-app-config.js --recite-check off        # hide Recite and Mark mistakes on phones
 *   ... node scripts/set-app-config.js --recite-check on         # offer them again
 *   ... node scripts/set-app-config.js --recite-where auto       # phone, server, auto, or unset
 *   ... node scripts/set-app-config.js --early-access on         # every new account gets Premium (PREM-1)
 *   ... node scripts/set-app-config.js --early-access off        # paid Premium: new accounts stop; grants stay
 *   ... node scripts/set-app-config.js --ramadan 2027-02-08,2027-03-09   # 1 Ramadan, 1 Shawwal (or unset)
 *
 * A minimum above what the store has now is refused without --force: the app
 * would ignore it until the store caught up, then block everyone below it at once.
 * Phones read the document at launch and every 6 hours.
 */
const admin = require('firebase-admin');

const BUNDLE_ID = 'com.revisionbuddy.app';
const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const REVO = ['testers', 'everyone', 'off'];
const WHATS_NEW = ['on', 'off'];

function compare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function parseArgs(argv) {
  const opts = { show: false, force: false, clearMin: false };
  const flags = { '--min-ios': 'minIos', '--min-android': 'minAndroid', '--latest-android': 'latestAndroid' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--show') opts.show = true;
    else if (a === '--latest-android-code') {
      const v = argv[++i];
      if (!/^[1-9]\d{0,9}$/.test(v || '')) throw new Error(`${a} needs a version code like 7 (got ${v ?? 'nothing'})`);
      opts.latestAndroidCode = Number(v);
    }
    else if (a === '--revo') {
      const v = argv[++i];
      if (!REVO.includes(v)) throw new Error(`--revo needs one of ${REVO.join(', ')} (got ${v ?? 'nothing'})`);
      opts.revo = v;
    }
    else if (a === '--revo-patterns') {
      const v = argv[++i];
      if (!WHATS_NEW.includes(v)) throw new Error(`--revo-patterns needs on or off (got ${v ?? 'nothing'})`);
      opts.revoPatterns = v;
    }
    else if (a === '--revo-recite') {
      const v = argv[++i];
      if (!WHATS_NEW.includes(v)) throw new Error(`--revo-recite needs on or off (got ${v ?? 'nothing'})`);
      opts.revoRecite = v;
    }
    else if (a === '--early-access') {
      const v = argv[++i];
      if (!WHATS_NEW.includes(v)) throw new Error(`--early-access needs on or off (got ${v ?? 'nothing'})`);
      opts.earlyAccess = v;
    }
    else if (a === '--whats-new') {
      const v = argv[++i];
      if (!WHATS_NEW.includes(v)) throw new Error(`--whats-new needs on or off (got ${v ?? 'nothing'})`);
      opts.whatsNew = v;
    }
    else if (a === '--recite-check') {
      const v = argv[++i];
      if (!WHATS_NEW.includes(v)) throw new Error(`--recite-check needs on or off (got ${v ?? 'nothing'})`);
      opts.reciteCheck = v;
    }
    else if (a === '--recite-where') {
      const v = argv[++i];
      if (!['phone', 'server', 'auto', 'unset'].includes(v)) {
        throw new Error(`--recite-where needs phone, server, auto or unset (got ${v ?? 'nothing'})`);
      }
      opts.reciteWhere = v;
    }
    else if (a === '--ramadan') {
      const v = argv[++i];
      const m = /^(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/.exec(v || '');
      const days = m ? (Date.parse(`${m[2]}T00:00:00Z`) - Date.parse(`${m[1]}T00:00:00Z`)) / 86400000 : NaN;
      if (v !== 'unset' && !(days === 29 || days === 30)) {
        throw new Error(`--ramadan needs START,EID 29 or 30 days apart, like 2027-02-08,2027-03-09, or unset (got ${v ?? 'nothing'})`);
      }
      opts.ramadan = v === 'unset' ? 'unset' : { start: m[1], eid: m[2] };
    }
    else if (a === '--force') opts.force = true;
    else if (a === '--clear-min') opts.clearMin = true;
    else if (flags[a]) {
      const v = argv[++i];
      if (!VERSION.test(v || '')) throw new Error(`${a} needs a version like 1.0.4 (got ${v ?? 'nothing'})`);
      opts[flags[a]] = v;
    } else throw new Error(`Unknown argument ${a}`);
  }
  return opts;
}

async function appStoreVersion() {
  const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&t=${Date.now()}`);
  if (!res.ok) throw new Error(`App Store lookup answered ${res.status}`);
  const app = ((await res.json()).results || []).find((r) => r.bundleId === BUNDLE_ID);
  return app && VERSION.test(app.version) ? app.version : null;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(
      'Usage: node scripts/set-app-config.js --show | [--min-ios V] [--min-android V] [--latest-android V [--latest-android-code N]] [--clear-min] [--revo testers|everyone|off] [--revo-patterns on|off] [--revo-recite on|off] [--whats-new on|off] [--recite-check on|off] [--recite-where phone|server|auto|unset] [--early-access on|off] [--ramadan START,EID|unset] [--force]',
    );
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
    process.exit(1);
  }
  admin.initializeApp();
  const ref = admin.firestore().doc('config/app');
  const current = (await ref.get()).data() || {};
  const store = await appStoreVersion().catch((err) => {
    console.warn(`(App Store lookup failed: ${err.message})`);
    return null;
  });

  const show = (data) => {
    const testing = (data.testing || {}).android;
    console.log(
      JSON.stringify(
        {
          minSupported: data.minSupported || {},
          latest: data.latest || {},
          testing: testing ? { android: { version: testing.version, code: testing.code } } : {},
          revo: REVO.includes(data.revo) ? data.revo : 'testers (unset)',
          revoPatterns: data.revoPatterns === true ? 'on' : 'off',
          revoRecite: data.revoRecite === true ? 'on' : 'off',
          whatsNew: data.whatsNewOff === true ? 'off' : 'on',
          reciteCheck: data.reciteCheckOff === true ? 'off' : 'on',
          reciteWhere: data.recite?.where ?? 'server (unset)',
          earlyAccess: data.earlyAccess === true ? 'on' : 'off',
          ramadan: data.ramadan ?? 'the app\'s expected dates (unset)',
        },
        null,
        2,
      ),
    );
    console.log(`App Store has ${store ?? 'unknown'}.`);
  };
  const changes = opts.minIos || opts.minAndroid || opts.latestAndroid || opts.clearMin || opts.revo || opts.revoPatterns || opts.revoRecite || opts.whatsNew
    || opts.reciteCheck || opts.reciteWhere || opts.earlyAccess || opts.ramadan;
  if (opts.show || !changes) {
    show(current);
    return;
  }

  const latestAndroid = opts.latestAndroid || (current.latest || {}).android || null;
  if (!opts.force) {
    if (opts.minIos && (!store || compare(store, opts.minIos) < 0)) {
      console.error(`Refused: the App Store has ${store ?? 'no version it could read'}, below --min-ios ${opts.minIos}. --force to set it anyway.`);
      process.exit(1);
    }
    if (opts.minAndroid && (!latestAndroid || compare(latestAndroid, opts.minAndroid) < 0)) {
      console.error(`Refused: latest.android is ${latestAndroid ?? 'unset'}, below --min-android ${opts.minAndroid}. Set --latest-android first (or --force).`);
      process.exit(1);
    }
  }

  const FieldValue = admin.firestore.FieldValue;
  const update = { updatedAt: FieldValue.serverTimestamp() };
  if (opts.clearMin) update.minSupported = FieldValue.delete();
  if (opts.minIos) update['minSupported.ios'] = opts.minIos;
  if (opts.minAndroid) update['minSupported.android'] = opts.minAndroid;
  if (opts.latestAndroidCode && !opts.latestAndroid) {
    console.error('--latest-android-code goes with --latest-android.');
    process.exit(1);
  }
  if (opts.latestAndroid) {
    update['latest.android'] = opts.latestAndroid;
    // A version alone clears the old code: it belonged to another build.
    update['latest.androidCode'] = opts.latestAndroidCode || FieldValue.delete();
  }
  if (opts.revo) update.revo = opts.revo;
  if (opts.revoPatterns) update.revoPatterns = opts.revoPatterns === 'on' ? true : FieldValue.delete();
  if (opts.revoRecite) update.revoRecite = opts.revoRecite === 'on' ? true : FieldValue.delete();
  if (opts.whatsNew) update.whatsNewOff = opts.whatsNew === 'off' ? true : FieldValue.delete();
  if (opts.reciteCheck) update.reciteCheckOff = opts.reciteCheck === 'off' ? true : FieldValue.delete();
  if (opts.reciteWhere) update['recite.where'] = opts.reciteWhere === 'unset' ? FieldValue.delete() : opts.reciteWhere;
  if (opts.earlyAccess) update.earlyAccess = opts.earlyAccess === 'on';
  if (opts.ramadan) update.ramadan = opts.ramadan === 'unset' ? FieldValue.delete() : opts.ramadan;
  if (opts.clearMin && (opts.minIos || opts.minAndroid)) {
    console.error('--clear-min with a minimum: pick one.');
    process.exit(1);
  }
  // update() needs the document; create it empty first.
  if (!(await ref.get()).exists) await ref.set({});
  await ref.update(update);
  console.log('✓ config/app is now:');
  show((await ref.get()).data() || {});
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
