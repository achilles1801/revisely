// Pure logic for the Sentry → GitHub workflows (tested in __tests__).
//
// GitHub issues on this repository are public, so an issue carries only what is
// needed to find the bug: the error, where in our code, which build and update,
// how often. No user ids, locations, IP addresses or breadcrumb messages; the
// Sentry link (private) has the rest.

const marker = (sentryId) => `<!-- sentry-issue:${sentryId} -->`;

/** The GitHub issue already tracking a Sentry issue, if any. */
function findTracked(githubIssues, sentryId) {
  return githubIssues.find((i) => !i.pull_request && (i.body || '').includes(marker(sentryId))) || null;
}

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function issueTitle(issue) {
  return clip(`[Sentry] ${issue.shortId}: ${issue.title}`, 180);
}

function tagMap(event) {
  const out = {};
  for (const t of event?.tags || []) out[t.key] = t.value;
  return out;
}

/** In-app stack frames of the event's first exception, innermost first. */
function inAppFrames(event, max = 8) {
  const exc = (event?.entries || []).find((e) => e.type === 'exception');
  const values = exc?.data?.values || [];
  const frames = values.flatMap((v) => v?.stacktrace?.frames || []);
  return frames
    .filter((f) => f.inApp)
    .reverse()
    .slice(0, max)
    .map((f) => `${f.function || '?'} (${f.filename || f.module || '?'}:${f.lineNo ?? '?'})`);
}

function exceptionLine(event) {
  const exc = (event?.entries || []).find((e) => e.type === 'exception');
  const v = (exc?.data?.values || []).slice(-1)[0];
  return v ? clip(`${v.type || 'Error'}: ${v.value || ''}`, 300) : null;
}

/** Why the issue is being raised now. */
function reason(issue) {
  const s = issue.substatus;
  if (s === 'regressed') return 'Regressed (was resolved, happened again)';
  if (s === 'escalating') return 'Escalating (happening much more than usual)';
  return 'New';
}

function issueBody(issue, event) {
  const tags = tagMap(event);
  const ota = event?.contexts?.ota_updates || {};
  const frames = inAppFrames(event);
  const lines = [
    marker(issue.id),
    `**${reason(issue)}** · ${issue.level || 'error'} · ${issue.count} events · ${issue.userCount} users`,
    `First seen ${issue.firstSeen} · last seen ${issue.lastSeen}`,
    '',
    `Sentry: ${issue.permalink}`,
    '',
    '| | |',
    '|---|---|',
    `| Release | \`${tags.release || event?.release || '—'}\` |`,
    `| Environment | ${tags.environment || event?.environment || '—'} |`,
    `| Update | ${ota.update_id || tags.update_id || '—'}${ota.is_embedded_launch === true || tags.embedded_launch === 'true' ? ' (built-in)' : ''} |`,
    `| Runtime | ${ota.runtime_version || tags.runtime || '—'} |`,
    `| Device / OS | ${tags.device || '—'} / ${tags.os || '—'} |`,
  ];
  const exc = exceptionLine(event);
  if (exc) lines.push('', '```', exc, '```');
  if (issue.culprit) lines.push('', `Culprit: \`${clip(issue.culprit, 200)}\``);
  if (frames.length) lines.push('', 'In-app frames (innermost first):', ...frames.map((f) => `- \`${f}\``));
  lines.push(
    '',
    '_Opened by the Sentry sync (.github/workflows/sentry.yml). Claude investigates issues labelled `claude-fix` and opens a fix PR into `develop`; it never merges or promotes._',
  );
  return lines.join('\n');
}

/** Session totals per release from a Sentry sessions response. */
function sessionsByRelease(response) {
  const out = new Map();
  for (const g of response?.groups || []) {
    const release = g.by?.release;
    const status = g.by?.['session.status'];
    if (!release) continue;
    const r = out.get(release) || { release, sessions: 0, crashed: 0, abnormal: 0, errored: 0, users: 0 };
    const n = Number(g.totals?.['sum(session)'] || 0);
    r.sessions += n;
    if (status === 'crashed') r.crashed += n;
    else if (status === 'abnormal') r.abnormal += n;
    else if (status === 'errored') r.errored += n;
    // Users are counted per status group; the largest is a fair lower bound.
    r.users = Math.max(r.users, Number(g.totals?.['count_unique(user)'] || 0));
    out.set(release, r);
  }
  for (const r of out.values()) r.crashFree = r.sessions ? 1 - r.crashed / r.sessions : null;
  return [...out.values()].sort((a, b) => b.sessions - a.sessions);
}

/** Totals over the releases that ran one update group (any build): release ends with `.u<group8>`. */
function updateHealth(releases, updateGroup) {
  const short = String(updateGroup || '').replace(/[^0-9a-f]/gi, '').toLowerCase().slice(0, 8);
  const mine = releases.filter((r) => short.length === 8 && r.release.endsWith(`.u${short}`));
  const t = mine.reduce(
    (a, r) => ({ sessions: a.sessions + r.sessions, crashed: a.crashed + r.crashed, users: a.users + r.users }),
    { sessions: 0, crashed: 0, users: 0 },
  );
  return { ...t, releases: mine.map((r) => r.release), crashFree: t.sessions ? 1 - t.crashed / t.sessions : null };
}

/** Whether an update may be promoted: enough sessions on preview, and crash-free at or above the bar. */
function gate(health, { minSessions, minCrashFree }) {
  if (health.sessions < minSessions) {
    return { ok: false, reason: `Only ${health.sessions} preview session(s) ran this update; ${minSessions} needed. Use it in TestFlight a little more, or override.` };
  }
  if (health.crashFree < minCrashFree) {
    return { ok: false, reason: `Crash-free sessions ${pct(health.crashFree)} on preview (${health.crashed} crashed of ${health.sessions}); at least ${pct(minCrashFree)} needed.` };
  }
  return { ok: true, reason: `Crash-free sessions ${pct(health.crashFree)} over ${health.sessions} preview sessions.` };
}

/** Production releases (with enough sessions to judge) below the bar. */
function productionAlerts(releases, { minSessions, minCrashFree }) {
  return releases.filter((r) => r.sessions >= minSessions && r.crashFree != null && r.crashFree < minCrashFree);
}

const pct = (x) => (x == null ? '—' : `${(Math.floor(x * 1000) / 10).toFixed(1)}%`);

function healthTable(releases, max = 8) {
  if (!releases.length) return '_No sessions._';
  return [
    '| Release | Sessions | Crash-free | Crashed | Users |',
    '|---|---:|---:|---:|---:|',
    ...releases.slice(0, max).map((r) => `| \`${r.release.replace(/^com\.revisionbuddy\.app@/, '')}\` | ${r.sessions} | ${pct(r.crashFree)} | ${r.crashed} | ${r.users} |`),
  ].join('\n');
}

function issueList(issues, max = 10) {
  if (!issues.length) return '_None._';
  return issues
    .slice(0, max)
    .map((i) => `- [${i.shortId}](${i.permalink}) ${clip(i.title, 120)} · ${i.count} events · ${i.userCount} users`)
    .join('\n');
}

function dailyReport({ date, newIssues, regressed, top, feedback, production, preview, alerts, mention }) {
  const head = alerts.length
    ? `⚠️ **${alerts.length} production release(s) below the crash-free bar.**`
    : '✅ Production crash-free rate is above the bar.';
  return [
    `## App health · ${date} (last 24 h)`,
    mention ? `${mention} ${head}` : head,
    '',
    `### New issues (${newIssues.length})`,
    issueList(newIssues),
    '',
    `### Regressed (${regressed.length})`,
    issueList(regressed),
    '',
    '### Most events',
    issueList(top, 5),
    '',
    `### Problem reports (${feedback.length})`,
    issueList(feedback, 5),
    '',
    '### Production (App Store)',
    healthTable(production),
    '',
    '### Preview (TestFlight testers)',
    healthTable(preview),
  ].join('\n');
}

module.exports = {
  marker,
  findTracked,
  issueTitle,
  issueBody,
  inAppFrames,
  sessionsByRelease,
  updateHealth,
  gate,
  productionAlerts,
  dailyReport,
  pct,
};
