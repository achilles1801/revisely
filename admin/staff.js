// Staff in Revisely Console (owner only, roles.manage): who has which role, giving a role to an account by its exact
// email, changing or taking one away (adminConsole staff.*). The server refuses your own role, the App Review account
// and the last owner (functions/src/console/staff.ts); every change goes to the audit log's Role changes.
import { confirmDialog, dayYear, esc, failureText, toast } from '/ui.js';

const $ = (id) => document.getElementById(id);

let ctx = null;
const st = { rows: [], roles: [], loaded: false };

const nameOf = (role) => (st.roles.find((r) => r.role === role) || {}).name || role;

export function start(c) {
  ctx = c;
  $('staffGive').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('staffEmail').value.trim();
    const role = $('staffRole').value;
    if (!email) return $('staffEmail').focus();
    ask({ email, role, label: email, from: null });
  });
  $('staffTable').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-uid]');
    if (!sel) return;
    const row = st.rows.find((r) => r.uid === sel.dataset.uid);
    const to = sel.value;
    sel.value = row.role; // stays as it is until the change is confirmed and reloaded
    if (to !== row.role) ask({ uid: row.uid, role: to, label: row.email || row.uid, from: row.role });
  });
  $('staffTable').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-remove]');
    if (!b) return;
    const row = st.rows.find((r) => r.uid === b.dataset.remove);
    ask({ uid: row.uid, role: 'none', label: row.email || row.uid, from: row.role });
  });
}

export function shown() {
  load();
}

async function load() {
  const conn = $('staffConn');
  try {
    const res = await ctx.call('adminConsole', { action: 'staff.list' });
    st.rows = res.rows;
    st.roles = res.roles;
    conn.hidden = true;
  } catch (err) {
    conn.hidden = false;
    conn.textContent = failureText(err);
  }
  st.loaded = true;
  render();
}

function ask({ uid, email, role, label, from }) {
  const removing = role === 'none';
  const opens = removing ? [] : (st.roles.find((r) => r.role === role) || {}).permissions || [];
  const title = removing ? 'Take this role away?' : from ? 'Change this role?' : 'Give this role?';
  const line = removing
    ? '<b>' + esc(label) + '</b> loses <b>' + esc(nameOf(from)) + '</b>. It stops working at their next action in the console.'
    : '<b>' + esc(label) + '</b> becomes <b>' + esc(nameOf(role)) + '</b>' + (from ? ' (now ' + esc(nameOf(from)) + ')' : '') + '. They can:';
  const list = opens.length ? '<ul class="staff-opens">' + opens.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '';
  confirmDialog(title, '<p>' + line + '</p>' + list + '<p class="sub">The audit log records it with your name.</p>', [
    { label: 'Cancel' },
    {
      label: removing ? 'Take it away' : from ? 'Change role' : 'Give role',
      cls: removing ? 'danger' : 'primary',
      run: async () => {
        try {
          const res = await ctx.call('adminConsole', { action: 'staff.set', role, ...(uid ? { uid } : { email }) });
          toast(res.changed ? esc(label) + (removing ? ' has no role now.' : ' is ' + esc(nameOf(role)) + ' now.') : 'Nothing changed: ' + esc(label) + ' already had that.');
          if (!uid) $('staffEmail').value = '';
          load();
          return null;
        } catch (err) {
          return failureText(err);
        }
      },
    },
  ]);
}

function render() {
  const roleOptions = (current) => st.roles.map((r) => '<option value="' + esc(r.role) + '"' + (r.role === current ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('');
  if (!$('staffRole').options.length && st.roles.length) {
    $('staffRole').innerHTML = roleOptions('reviewer');
  }
  const tbody = $('staffTable').querySelector('tbody');
  tbody.innerHTML = st.rows.length
    ? st.rows.map((r) => {
        const who = esc(r.email || r.uid) + (r.you ? ' <span class="tag">you</span>' : '') + (r.disabled ? ' <span class="tag">disabled</span>' : '');
        const role = r.you
          ? esc(nameOf(r.role))
          : '<select data-uid="' + esc(r.uid) + '" aria-label="Role of ' + esc(r.email || r.uid) + '">' + roleOptions(r.role) + '</select>';
        const actions = r.you ? '<span class="sub">Another owner can change yours</span>' : '<button type="button" class="btn sm" data-remove="' + esc(r.uid) + '">Take away</button>';
        return '<tr><td>' + who + '</td><td>' + role + '</td><td>' + (r.lastSignInAt ? esc(dayYear(r.lastSignInAt)) : '<span class="none">never</span>') + '</td><td>' + actions + '</td></tr>';
      }).join('')
    : '<tr><td colspan="4" class="none">' + (st.loaded ? 'Nobody has a role.' : 'Loading…') + '</td></tr>';
  $('staffRoles').innerHTML = st.roles
    .map((r) => '<div class="w"><div class="w-h"><h3>' + esc(r.name) + '</h3></div><ul class="staff-opens">' + r.permissions.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul></div>')
    .join('');
}
