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
 *   whatsNewOff                  The "What's new" kill switch (src/lib/whatsNew/
 *                                killSwitch.ts): true stops the walkthrough after
 *                                the update for everyone, without an update, in
 *                                case a card turns out wrong. Phones read it at
 *                                launch and back in front after 10 minutes.
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
 *   ... node scripts/set-app-config.js --whats-new off           # stop the What's new walkthrough
 *   ... node scripts/set-app-config.js --whats-new on            # let it show again
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
    else if (a === '--whats-new') {
      const v = argv[++i];
      if (!WHATS_NEW.includes(v)) throw new Error(`--whats-new needs on or off (got ${v ?? 'nothing'})`);
      opts.whatsNew = v;
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
      'Usage: node scripts/set-app-config.js --show | [--min-ios V] [--min-android V] [--latest-android V [--latest-android-code N]] [--clear-min] [--revo testers|everyone|off] [--whats-new on|off] [--force]',
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
          whatsNew: data.whatsNewOff === true ? 'off' : 'on',
        },
        null,
        2,
      ),
    );
    console.log(`App Store has ${store ?? 'unknown'}.`);
  };
  const changes = opts.minIos || opts.minAndroid || opts.latestAndroid || opts.clearMin || opts.revo || opts.whatsNew;
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
  if (opts.whatsNew) update.whatsNewOff = opts.whatsNew === 'off' ? true : FieldValue.delete();
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
