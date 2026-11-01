#!/usr/bin/env node
// Google Play from the command line: what each track holds, moving a build between tracks, and the
// production rollout. The Android twin of scripts/asc.js. No dependencies (Node 20+).
//
//   node scripts/play.js status                                  every track's releases; changes nothing
//   node scripts/play.js promote <versionCode> --to alpha        put a build on a track (alpha = Closed testing)
//   node scripts/play.js promote <versionCode> --to production --rollout 0.2 --yes
//   node scripts/play.js rollout 0.5|1 --yes                     widen production's staged rollout (1 = everyone)
//   node scripts/play.js halt --yes                              stop production's staged rollout
//
// Options: --from <track> (whose release name and notes to copy; default: the track holding the
// build), --notes "text" (en-US release notes), --dry-run (print the change, commit nothing).
// Production changes need --yes: they reach store users, so a person decides (CLAUDE.md, Android).
//
// Builds reach Play only by upload (android-build.yml, eas submit to internal testing); this never
// uploads. Closed testing and production changes go to Google for review when committed.
//
// Key: PLAY_KEY_PATH (a service account JSON key file) or PLAY_SERVICE_ACCOUNT_JSON (its contents).
// Moving builds between testing tracks needs "Release apps to testing tracks"; production needs
// "Release to production, exclude devices, and use Play App Signing" on that account.
const crypto = require('crypto');
const fs = require('fs');

const PACKAGE = 'com.revisionbuddy.app';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TRACKS = ['internal', 'alpha', 'beta', 'production'];
const TRACK_NAMES = { internal: 'Internal testing', alpha: 'Closed testing', beta: 'Open testing', production: 'Production' };

// ---- pure (tested in scripts/__tests__/play.test.js) ------------------------------------------

/** Parse argv after the command: positionals and --flags (a flag without a value is true). */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/** A rollout fraction: a number in (0, 1]. Anything else throws (never a silent default). */
function parseFraction(value) {
  const n = Number(value);
  if (value === true || value === '' || !Number.isFinite(n) || n <= 0 || n > 1) {
    throw new Error(`A rollout is a fraction above 0 and at most 1 (0.1 = 10%), not "${value}".`);
  }
  return n;
}

function parseVersionCode(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Not a version code: "${value}".`);
  return n;
}

/** The release on a track that holds a version code, newest first, or null. */
function findRelease(tracks, versionCode, only) {
  for (const t of tracks) {
    if (only && t.track !== only) continue;
    const r = (t.releases || []).find((x) => (x.versionCodes || []).map(Number).includes(versionCode));
    if (r) return { track: t.track, release: r };
  }
  return null;
}

/**
 * The release to put on `to` for a build: its name and notes come from where it already is (or
 * `notes`). Testing tracks get it whole (completed); production gets it staged when rollout < 1.
 */
function planPromote(tracks, { versionCode, to, from, rollout, notes }) {
  if (!TRACKS.includes(to)) throw new Error(`Unknown track "${to}" (one of ${TRACKS.join(', ')}).`);
  const source = findRelease(tracks, versionCode, from);
  if (!source) {
    throw new Error(`Version code ${versionCode} is on no track${from ? ` named ${from}` : ''}. Upload it first (EAS Build).`);
  }
  if (source.track === to) {
    const status = source.release.status;
    if (status === 'completed' || (status === 'inProgress' && rollout == null)) {
      throw new Error(`Version code ${versionCode} is already on ${to} (${status}).`);
    }
  }
  const fraction = rollout == null ? 1 : parseFraction(rollout);
  if (to !== 'production' && fraction !== 1) throw new Error('Staged rollouts are for production only.');
  const release = {
    name: source.release.name || String(versionCode),
    versionCodes: [String(versionCode)],
    status: fraction < 1 ? 'inProgress' : 'completed',
    ...(fraction < 1 ? { userFraction: fraction } : {}),
    releaseNotes: notes ? [{ language: 'en-US', text: String(notes) }] : source.release.releaseNotes || [],
  };
  return { from: source.track, to, release };
}

/**
 * Production's releases after changing its staged rollout: a new fraction (1 completes it and
 * replaces the release it was rolling out over), or halted. A halted rollout can be resumed.
 */
function planRollout(tracks, { fraction, halt }) {
  const releases = tracks.find((t) => t.track === 'production')?.releases || [];
  const staged = releases.find((r) => r.status === 'inProgress' || r.status === 'halted');
  if (!staged) throw new Error('Production has no staged rollout to change.');
  const live = releases.filter((r) => r.status === 'completed');
  if (halt) return [...live, { ...staged, status: 'halted' }];
  const f = parseFraction(fraction);
  if (f === 1) {
    const { userFraction, ...rest } = staged;
    return [{ ...rest, status: 'completed' }];
  }
  if (staged.userFraction != null && f < staged.userFraction) {
    throw new Error(`A rollout only widens: production is at ${staged.userFraction}, not going to ${f}.`);
  }
  return [...live, { ...staged, status: 'inProgress', userFraction: f }];
}

/** Plain-text summary of every track. */
function describeTracks(tracks) {
  const lines = [];
  for (const name of TRACKS) {
    const t = tracks.find((x) => x.track === name);
    const releases = (t?.releases || []).filter((r) => (r.versionCodes || []).length || r.status === 'draft');
    lines.push(`${TRACK_NAMES[name]} (${name}):`);
    if (!releases.length) lines.push('  nothing');
    for (const r of releases) {
      const pct = r.userFraction != null ? ` ${Math.round(r.userFraction * 100)}%` : '';
      lines.push(`  ${r.name || '(no name)'} — version code ${(r.versionCodes || []).join(', ') || '—'}, ${r.status}${pct}`);
    }
  }
  for (const t of tracks) {
    if (!TRACKS.includes(t.track)) lines.push(`${t.track}: ${(t.releases || []).map((r) => `${r.name} ${r.status}`).join('; ') || 'nothing'}`);
  }
  return lines.join('\n');
}

// ---- Google Play API --------------------------------------------------------------------------

function serviceAccount(env = process.env) {
  if (env.PLAY_SERVICE_ACCOUNT_JSON) return JSON.parse(env.PLAY_SERVICE_ACCOUNT_JSON);
  if (env.PLAY_KEY_PATH) return JSON.parse(fs.readFileSync(env.PLAY_KEY_PATH.replace(/^~/, env.HOME), 'utf8'));
  throw new Error('Set PLAY_KEY_PATH (the service account key file) or PLAY_SERVICE_ACCOUNT_JSON.');
}

async function accessToken(sa) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat: now, exp: now + 3600 })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), sa.private_key).toString('base64url');
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google sign-in for ${sa.client_email} -> ${res.status} ${json.error || ''} ${json.error_description || ''}`);
  return json.access_token;
}

function client(token) {
  return async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.error?.message || text.slice(0, 300)}`);
    return json;
  };
}

/** Run fn inside an edit; commit it if fn returns true, otherwise (or on an error) drop it. */
async function withEdit(api, fn) {
  const { id } = await api('POST', '/edits');
  let committed = false;
  try {
    if ((await fn(id)) === true) {
      await api('POST', `/edits/${id}:commit`);
      committed = true;
    }
  } finally {
    if (!committed) await api('DELETE', `/edits/${id}`).catch(() => {});
  }
}

async function tracksOf(api, edit) {
  return (await api('GET', `/edits/${edit}/tracks`)).tracks || [];
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (!command || command === 'help' || args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 21).join('\n'));
    return;
  }
  const api = client(await accessToken(serviceAccount()));
  const dryRun = Boolean(args['dry-run']);

  if (command === 'status') {
    await withEdit(api, async (edit) => {
      console.log(describeTracks(await tracksOf(api, edit)));
      return false;
    });
    return;
  }

  if (command === 'promote') {
    const versionCode = parseVersionCode(args._[0]);
    const to = args.to;
    if (!to || to === true) throw new Error('Name the track: --to internal|alpha|beta|production.');
    if (to === 'production' && !args.yes && !dryRun) throw new Error('Production reaches store users: add --yes (or --dry-run first).');
    await withEdit(api, async (edit) => {
      const plan = planPromote(await tracksOf(api, edit), {
        versionCode,
        to,
        from: args.from === true ? undefined : args.from,
        rollout: args.rollout,
        notes: args.notes === true ? undefined : args.notes,
      });
      console.log(`${dryRun ? '[dry run] ' : ''}${plan.from} → ${plan.to}: ${JSON.stringify(plan.release)}`);
      if (dryRun) return false;
      await api('PUT', `/edits/${edit}/tracks/${plan.to}`, { track: plan.to, releases: [plan.release] });
      return true;
    });
    if (!dryRun) console.log(`Committed. ${TRACK_NAMES[to]} changes other than internal testing go to Google for review.`);
    return;
  }

  if (command === 'rollout' || command === 'halt') {
    if (!args.yes && !dryRun) throw new Error('Production reaches store users: add --yes (or --dry-run first).');
    await withEdit(api, async (edit) => {
      const releases = planRollout(await tracksOf(api, edit), command === 'halt' ? { halt: true } : { fraction: args._[0] });
      console.log(`${dryRun ? '[dry run] ' : ''}production: ${JSON.stringify(releases)}`);
      if (dryRun) return false;
      await api('PUT', `/edits/${edit}/tracks/production`, { track: 'production', releases });
      return true;
    });
    return;
  }

  throw new Error(`Unknown command "${command}". Try: node scripts/play.js help`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { parseArgs, parseFraction, parseVersionCode, findRelease, planPromote, planRollout, describeTracks };
