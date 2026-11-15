// The audit log in Revisely Console: every Open Door decision (who, what, when, the internal note) and every role
// change, newest first (adminConsole audit.*; audit.read). Never an applicant's answers.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (t) => new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayYear = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const VERB = { approve: 'Approved', decline: 'Declined', revoke: 'Revoked' };
const CLS = { approve: 'ok', decline: 'nodata', revoke: 'alarm-on' };
const ROLE = { owner: 'Owner', admin: 'Admin', reviewer: 'Reviewer', dev: 'Developer' };
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
    const res = await ctx.call('adminConsole', { action: st.kind === 'roles' ? 'audit.roles' : 'audit.decisions', cursor: st.cursors[st.cursors.length - 1], limit: PAGE });
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
  } else {
    thead.innerHTML = '<tr><th>When</th><th>Account</th><th>Role</th><th>By</th></tr>';
    tbody.innerHTML = st.rows.length
      ? st.rows.map((r) => '<tr><td>' + esc(when(r.at)) + '</td><td>' + esc(r.email || r.uid) + '</td><td>' + esc(r.from ? ROLE[r.from] : 'No role') + ' → <b>' + esc(r.to ? ROLE[r.to] : 'No role') + '</b></td><td>' + by(r.by) + '</td></tr>').join('')
      : '<tr><td colspan="4" class="none">No role changes yet.</td></tr>';
  }
  const first = (st.cursors.length - 1) * PAGE;
  $('auditRange').textContent = st.rows.length ? first + 1 + '–' + (first + st.rows.length) + ' · newest first' : '';
  $('auditNewer').disabled = st.cursors.length <= 1;
  $('auditOlder').disabled = !st.next;
}
