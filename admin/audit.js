// The audit log in Revisely Console: every Open Door decision (who, what, when, the internal note), every role change
// and every saved recitation label with each tap that made it, newest first (adminConsole audit.*; audit.read). Never an
// applicant's answers.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (t) => new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayYear = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const VERB = { approve: 'Approved', decline: 'Declined', revoke: 'Revoked' };
const CLS = { approve: 'ok', decline: 'nodata', revoke: 'alarm-on' };
const ROLE = { owner: 'Owner', admin: 'Admin', reviewer: 'Reviewer', dev: 'Developer', labeller: 'Labeller' };
const PAGE = 50;

let ctx = null;
const st = { kind: 'decisions', cursors: [null], next: null, rows: [], loaded: false };

export function start(c) {
  ctx = c;
  $('auditKinds').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kind]');
    if (!b || b.dataset.kind === st.kind) return;
    st.kind = b.dataset.kind;
    st.cursors = [null];
    for (const x of $('auditKinds').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.kind === st.kind));
    load();
  });
  $('auditOlder').addEventListener('click', () => { if (st.next) { st.cursors.push(st.next); load(); } });
  $('auditNewer').addEventListener('click', () => { if (st.cursors.length > 1) { st.cursors.pop(); load(); } });
  $('auditTable').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-uid]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    ctx.go('/open-door/' + encodeURIComponent(a.dataset.uid));
  });
}

export function shown() {
  load();
}

async function load() {
  const conn = $('auditConn');
  try {
    const action = { roles: 'audit.roles', labels: 'audit.labels' }[st.kind] || 'audit.decisions';
    const res = await ctx.call('adminConsole', { action, cursor: st.cursors[st.cursors.length - 1], limit: PAGE });
    st.rows = res.rows;
    st.next = res.next;
    conn.hidden = true;
  } catch (err) {
    st.rows = [];
    st.next = null;
    conn.hidden = false;
    conn.textContent = (err && err.message) || 'The audit log didn’t load. Try again.';
  }
  render();
}

function by(b) {
  if (b.via === 'script') return '<span class="tag">script</span> ' + esc(b.email || '');
  if (b.via === 'invite') return esc(b.email || 'an owner');
  return esc(b.email || 'a reviewer') + (b.role ? ' <span class="tag">' + esc(ROLE[b.role] || b.role) + '</span>' : '');
}

function render() {
  const thead = $('auditTable').querySelector('thead');
  const tbody = $('auditTable').querySelector('tbody');
  const openDoor = ctx.me.openDoor;
  if (st.kind === 'decisions') {
    thead.innerHTML = '<tr><th>When</th><th>Decision</th><th>Account</th><th>By</th><th>Note</th></tr>';
    tbody.innerHTML = st.rows.length
      ? st.rows.map((d) => {
          const acct = d.email || (d.exists ? d.uid : 'Account deleted');
          const extra = d.action === 'approve' ? (d.until ? 'until ' + dayYear(d.until) : 'no end date') : d.applyAgainFrom ? 'may apply again ' + dayYear(d.applyAgainFrom) : '';
          return '<tr><td>' + esc(when(d.at)) + '</td><td><span class="state ' + CLS[d.action] + '">' + esc(VERB[d.action]) + '</span> <span class="sub">' + esc(extra) + '</span></td>' +
            '<td>' + (openDoor ? '<a href="/open-door/' + esc(encodeURIComponent(d.uid)) + '" data-uid="' + esc(d.uid) + '">' + esc(acct) + '</a>' : esc(acct)) + '</td><td>' + by(d.by) + '</td><td class="wrap">' + esc(d.note || '') + '</td></tr>';
        }).join('')
      : '<tr><td colspan="5" class="none">No decisions yet.</td></tr>';
  } else if (st.kind === 'labels') {
    thead.innerHTML = '<tr><th>When</th><th>Labeller</th><th>Clip</th><th>Result</th><th>Taps</th></tr>';
    tbody.innerHTML = st.rows.length
      ? st.rows.map((r) => '<tr><td>' + esc(when(r.at)) + '</td><td>' + by(r.by) + '</td>' +
          '<td><span class="mono">' + esc(r.clip) + '</span><br><span class="sub">' + esc(r.batch) + ' · ' + esc(r.where) + '</span></td>' +
          '<td class="wrap">' + labelResult(r) + '</td><td>' + labelTaps(r) + '</td></tr>').join('')
      : '<tr><td colspan="5" class="none">No labels yet.</td></tr>';
  } else {
    thead.innerHTML = '<tr><th>When</th><th>Account</th><th>Role</th><th>By</th></tr>';
    tbody.innerHTML = st.rows.length
      ? st.rows.map((r) => {
          if (r.kind === 'request') {
            const what = { seen: 'Asked for access (signed in with no role)', granted: 'Request granted' + (r.role ? ' as <b>' + esc(ROLE[r.role] || r.role) + '</b>' : ''), dismissed: 'Request dismissed', blocked: 'Blocked' }[r.action] || esc(r.action);
            return '<tr><td>' + esc(when(r.at)) + '</td><td>' + esc(r.email || r.uid) + '</td><td>' + what + '</td><td>' + (r.action === 'seen' ? '<span class="sub">—</span>' : by(r.by)) + '</td></tr>';
          }
          if (r.kind === 'invite') {
            const what = r.action === 'cancelled' ? 'Invite cancelled' : 'Invited';
            return '<tr><td>' + esc(when(r.at)) + '</td><td>' + esc(r.email) + '</td><td>' + what + (r.role ? ' as <b>' + esc(ROLE[r.role] || r.role) + '</b>' : '') + '</td><td>' + by(r.by) + '</td></tr>';
          }
          const via = r.by && r.by.via === 'invite' ? ' <span class="tag">from an invite, on first sign-in</span>' : '';
          return '<tr><td>' + esc(when(r.at)) + '</td><td>' + esc(r.email || r.uid) + '</td><td>' + esc(r.from ? ROLE[r.from] : 'No role') + ' → <b>' + esc(r.to ? ROLE[r.to] : 'No role') + '</b>' + via + '</td><td>' + by(r.by) + '</td></tr>';
        }).join('')
      : '<tr><td colspan="4" class="none">No role changes yet.</td></tr>';
  }
  const first = (st.cursors.length - 1) * PAGE;
  $('auditRange').textContent = st.rows.length ? first + 1 + '–' + (first + st.rows.length) + ' · newest first' : '';
  $('auditNewer').disabled = st.cursors.length <= 1;
  $('auditOlder').disabled = !st.next;
}

const RESULT = { fine: ['Fine', 'ok'], mistakes: ['Has mistakes', 'alarm-on'], unusable: ['Unusable', 'nodata'] };
const MISSED = { word: 'wrong word', skipped: 'skipped', added: 'extra word after', harakat: 'haraka', letter: 'letter', unclear: 'not clear' };
const SKIP = { audio: 'bad audio', 'not-this-passage': 'not this passage', other: 'another reason' };
const VERDICT = { yes: 'mistake', no: 'not a mistake', unsure: 'can’t tell' };

function labelResult(r) {
  const [name, cls] = RESULT[r.result] || [r.result, 'nodata'];
  const parts = [];
  const m = r.marks || {};
  const marks = (m.yes || 0) + (m.no || 0) + (m.unsure || 0);
  if (marks) parts.push(marks + (marks === 1 ? ' mark: ' : ' marks: ') + [m.yes ? m.yes + ' mistake' : '', m.no ? m.no + ' not' : '', m.unsure ? m.unsure + ' can’t tell' : ''].filter(Boolean).join(', '));
  for (const x of r.missed || []) parts.push('missed <span class="ar-inline" dir="rtl" lang="ar">' + esc(x.text) + '</span>: ' + esc(MISSED[x.label] || x.label));
  for (const x of r.notes || []) parts.push('✎ <span class="ar-inline" dir="rtl" lang="ar">' + esc(x.text) + '</span>: “<bdi>' + esc(x.note) + '</bdi>”');
  if (r.note) parts.push('✎ clip: “<bdi>' + esc(r.note) + '</bdi>”');
  if (r.skip) parts.push(esc(SKIP[r.skip] || r.skip));
  if (r.relabel) parts.push('changed an earlier label');
  return '<span class="state ' + cls + '">' + esc(name) + '</span> <span class="sub">' + parts.join(' · ') + ' · ' + Math.round((r.ms || 0) / 1000) + ' s</span>';
}

/** Each tap, in order: what it set and what it was before. */
function labelTaps(r) {
  const a = r.actions || [];
  if (!a.length) return '<span class="sub">—</span>';
  const line = (x) => {
    const at = (x.t / 1000).toFixed(1) + ' s';
    if (x.a === 'mark') {
      // A mark's id is `<word>:<kind>:<detail>` (recite-contract.md).
      const [w, kind] = String(x.id || '').split(':');
      return at + ' · ' + esc(kind || 'mark') + ' mark on word ' + esc(w) + ': ' + esc(VERDICT[x.v] || x.v) + (x.was ? ' (was ' + esc(VERDICT[x.was] || x.was) + ')' : '');
    }
    if (x.a === 'word') return at + ' · word ' + esc(String(x.w)) + ': ' + esc(MISSED[x.v] || x.v) + (x.was ? ' (was ' + esc(MISSED[x.was] || x.was) + ')' : '');
    if (x.a === 'clear') return at + ' · word ' + esc(String(x.w)) + ': fine (was ' + esc(MISSED[x.was] || x.was || '') + ')';
    if (x.a === 'fine') return at + ' · every open mark: not a mistake';
    if (x.a === 'undo') return at + ' · undo';
    if (x.a === 'note') return at + ' · note on word ' + esc(String(x.w)) + ' ' + esc(x.v || '');
    if (x.a === 'clipnote') return at + ' · note on the clip ' + esc(x.v || '');
    if (x.a === 'skip') return at + ' · set aside: ' + esc(SKIP[x.v] || x.v || '');
    return at + ' · ' + esc(x.a);
  };
  return '<details><summary>' + a.length + (a.length === 1 ? ' tap' : ' taps') + '</summary><ol class="taps">' + a.map((x) => '<li>' + line(x) + '</li>').join('') + '</ol></details>';
}
