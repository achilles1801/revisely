// Premium in Revisely Console (premium.read): how many accounts have Premium now and from where, what ends in the next
// 30 days, Open Door grants that ended, and dev grants on revisely-dev (adminConsole premium.summary). Counts only.
import { dayTime, esc, failureText } from '/ui.js';

const $ = (id) => document.getElementById(id);
const SOURCES = [
  ['support', 'Open Door', 'Free, through the support program'],
  ['purchase', 'Subscriptions', 'Paid in the stores or on the web'],
  ['gift', 'Gifts', 'Given by someone else'],
  ['family', 'Family', 'Shared from a family plan'],
  ['dev', 'Testing', 'The Dev app’s “Get Premium”'],
];
const n = (v) => Number(v || 0).toLocaleString();

let ctx = null;

export function start(c) {
  ctx = c;
  $('premiumRefresh').addEventListener('click', load);
}

export function shown() {
  load();
}

async function load() {
  const conn = $('premiumConn');
  $('premiumRefresh').disabled = true;
  try {
    render(await ctx.call('adminConsole', { action: 'premium.summary' }));
    conn.hidden = true;
  } catch (err) {
    conn.hidden = false;
    conn.textContent = failureText(err);
  } finally {
    $('premiumRefresh').disabled = false;
  }
}

function tile(title, big, detail, cls = '') {
  return '<div class="tile"><div class="t">' + esc(title) + '</div><div class="big ' + cls + '">' + big + '</div><div class="d">' + esc(detail) + '</div></div>';
}

function render(s) {
  $('premiumAsOf').textContent = 'As of ' + dayTime(s.asOf);
  $('premiumTop').innerHTML =
    tile('With Premium now', n(s.now.total), 'Every source, counted once per account') +
    tile('Ending in ' + s.endingWithinDays + ' days', n(s.endingSoon), 'Premium with an end date coming up', s.endingSoon ? 'warn' : '') +
    tile('Open Door grants that ended', n(s.supportEnded), 'Their end date passed (taken back ones aren’t counted)') +
    (s.devGrants == null ? '' : tile('Dev grants', n(s.devGrants), 'Testers with “Get Premium” on (this project only)'));
  $('premiumSources').innerHTML = SOURCES.filter(([key]) => key !== 'dev' || s.devGrants != null)
    .map(([key, name, what]) => tile(name, n(s.now.bySource[key]), what))
    .join('');
}
