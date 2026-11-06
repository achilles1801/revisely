// The weekly stats digest, pure parts: reading Apple's Sales and Trends summary
// reports, sorting units into first downloads / re-downloads / updates, the
// weeks to compare, and the Markdown posted on the "App stats" issue. No network
// here (appStore.js fetches, weekly.js runs it).

/**
 * Apple's product type identifiers (Sales and Trends, "Product Type Identifier"):
 * 1 = a first download of an app (F: universal, T: iPad, F1: Mac), 3 = a
 * re-download, 7 = an update. Other types (in-app purchases, bundles) are none
 * of these for a free app with no purchases.
 */
const TYPES = {
  first: new Set(['1', '1F', '1T', 'F1', '1E', '1EP', '1EU']),
  redownload: new Set(['3', '3F', '3T', 'F3']),
  update: new Set(['7', '7F', '7T', 'F7']),
};

function kindOf(productType) {
  const t = String(productType || '').trim();
  for (const [kind, set] of Object.entries(TYPES)) if (set.has(t)) return kind;
  return null;
}

/** A summary report (tab-separated, header first) as objects keyed by column name. */
function parseSummary(tsv) {
  const lines = String(tsv || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

/** Units by kind and by country (first downloads) for one app, from report rows. */
function tally(rows, appleId) {
  const out = { first: 0, redownload: 0, update: 0, countries: {} };
  for (const r of rows) {
    if (appleId && r['Apple Identifier'] && r['Apple Identifier'] !== String(appleId)) continue;
    const kind = kindOf(r['Product Type Identifier']);
    if (!kind) continue;
    const units = Number(r.Units) || 0;
    out[kind] += units;
    if (kind === 'first') {
      const c = r['Country Code'] || '??';
      out.countries[c] = (out.countries[c] || 0) + units;
    }
  }
  return out;
}

function add(a, b) {
  const countries = { ...a.countries };
  for (const [c, n] of Object.entries(b.countries)) countries[c] = (countries[c] || 0) + n;
  return { first: a.first + b.first, redownload: a.redownload + b.redownload, update: a.update + b.update, countries };
}

const EMPTY = () => ({ first: 0, redownload: 0, update: 0, countries: {} });

/** YYYY-MM-DD of a date (UTC parts). */
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/**
 * The week the digest reports: Monday to Sunday before `now` (Apple's report
 * dates are Pacific; Monday morning in the US is still that Monday everywhere
 * west of UTC+14, so "yesterday" is Sunday), and the week before it.
 */
function weeks(now) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (today.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const thisMonday = addDays(today, -dow);
  const start = addDays(thisMonday, -7);
  const days = (from) => Array.from({ length: 7 }, (_, i) => ymd(addDays(from, i)));
  return { week: days(start), previous: days(addDays(start, -7)) };
}

/** The months from `launch` up to (not including) the month of `now`, as YYYY-MM. */
function monthsSince(launch, now) {
  const out = [];
  let y = Number(launch.slice(0, 4));
  let m = Number(launch.slice(5, 7));
  const endY = now.getUTCFullYear();
  const endM = now.getUTCMonth() + 1;
  while (y < endY || (y === endY && m < endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** The days of a month (YYYY-MM) from `from` (inclusive) up to `until` (exclusive), as YYYY-MM-DD. */
function daysOfMonth(month, from, until) {
  const out = [];
  let d = new Date(`${month}-01T00:00:00Z`);
  while (ymd(d).slice(0, 7) === month) {
    const s = ymd(d);
    if (s >= from && s < until) out.push(s);
    d = addDays(d, 1);
  }
  return out;
}

const fmt = (n) => n.toLocaleString('en-US');

function change(now, before) {
  if (before === 0) return now === 0 ? '·' : 'new';
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? '±0%' : `${pct > 0 ? '+' : ''}${pct}%`;
}

const DAY = (s) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Two-letter country code as a name ("US" → "United States"); the code if unknown. */
function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/**
 * The digest. `appStore`: { week, previous, total, missing: [dates] } tallies, or
 * null when the reports can't be read yet. `play`: null until Google Play is live.
 */
function renderDigest({ weekDays, launch, appStore, play, mention }) {
  const lines = [];
  lines.push(`### Week of ${DAY(weekDays[0])} – ${DAY(weekDays[6])}`);
  lines.push('');
  lines.push('**App Store**');
  if (!appStore) {
    lines.push('');
    lines.push("_Sales and Trends couldn't be read this week (see the workflow run)._");
  } else {
    const { week, previous, total, missing } = appStore;
    lines.push('');
    lines.push('| | This week | Last week | Change |');
    lines.push('|---|---:|---:|---:|');
    for (const [label, key] of [
      ['First-time downloads', 'first'],
      ['Re-downloads', 'redownload'],
      ['Updates', 'update'],
    ]) {
      lines.push(`| ${label} | ${fmt(week[key])} | ${fmt(previous[key])} | ${change(week[key], previous[key])} |`);
    }
    const top = Object.entries(week.countries)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5);
    lines.push('');
    lines.push(
      top.length
        ? `Top countries (first downloads): ${top.map(([c, n]) => `${countryName(c)} ${fmt(n)}`).join(' · ')}`
        : 'No first-time downloads this week.',
    );
    lines.push('');
    lines.push(
      `Since launch (${DAY(launch)}): ${fmt(total.first)} first-time downloads · ${fmt(total.redownload)} re-downloads · ${fmt(total.update)} updates`,
    );
    if (missing.length) {
      lines.push('');
      lines.push(`_Not yet in Apple's reports: ${missing.map(DAY).join(', ')} (counted next week)._`);
    }
  }
  lines.push('');
  lines.push('**Google Play**');
  lines.push('');
  lines.push(play ? play : '_Not live yet._');
  lines.push('');
  lines.push(`${mention || ''} · Sales and Trends counts by Pacific day; numbers can change for a day or two.`.trim());
  return lines.join('\n');
}

module.exports = { EMPTY, add, daysOfMonth, kindOf, monthsSince, parseSummary, renderDigest, tally, weeks, change, ymd };
/**
 * The Ask coach's line for the week (C6): the coachLedgerDay documents of the week, summed. Only
 * counts, tokens and dollars: no user, no question, no answer. `days` may be empty or absent.
 */
function coachLine(days) {
  const t = (days || []).reduce(
    (a, d) => ({
      calls: a.calls + (Number(d.calls) || 0),
      input: a.input + (Number(d.inputTokens) || 0),
      output: a.output + (Number(d.outputTokens) || 0),
      cacheRead: a.cacheRead + (Number(d.cacheReadTokens) || 0),
      cacheWrite: a.cacheWrite + (Number(d.cacheWriteTokens) || 0),
      spend: a.spend + (Number(d.spendUsd) || 0),
    }),
    { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, spend: 0 },
  );
  if (t.calls === 0) return 'Ask coach: no answers this week.';
  const cached = t.cacheRead + t.cacheWrite;
  const share = cached > 0 ? Math.round((100 * t.cacheRead) / cached) : null;
  const answers = t.calls + (t.calls === 1 ? ' answer' : ' answers');
  const cache = share == null ? '' : ', ' + share + '% of cached input read from cache';
  const tokens = t.input + t.cacheRead + t.cacheWrite + ' input tokens, ' + t.output + ' output' + cache;
  return 'Ask coach: ' + answers + ', $' + t.spend.toFixed(2) + ' (' + tokens + ').';
}

module.exports.coachLine = coachLine;
