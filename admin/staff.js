// Staff in Revisely Console (owner only, roles.manage). First the access requests: people who signed in without a role,
// each with Give Labeller (one tap), another role, Dismiss and Block. Then who has which role (change or take away), the
// pending invites, and adding someone by email (a role now if they have signed in before, else an invite that attaches
// on their first sign-in). adminConsole staff.*; functions/src/console/staff.ts and invites.ts.
// The server refuses your own role, the App Review account and the last owner; every change, invite and cancelled
// invite goes to the audit log's Role changes.
import { confirmDialog, dayYear, esc, failureText, toast } from '/ui.js';

const $ = (id) => document.getElementById(id);

let ctx = null;
const st = { rows: [], roles: [], invites: [], requests: [], loaded: false };

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
  $('staffReqs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    const r = st.requests.find((x) => x.uid === b.dataset.uid);
    if (!r) return;
    const label = r.email || r.name || r.uid;
    if (b.dataset.act === 'labeller') give(r, 'labeller', b);
    else if (b.dataset.act === 'role') {
      const role = $('staffReqs').querySelector('select[data-uid="' + CSS.escape(r.uid) + '"]').value;
      if (role === 'labeller') give(r, role, b);
      else ask({ uid: r.uid, role, label, from: null });
    } else if (b.dataset.act === 'dismiss') settle(r, 'dismiss', b);
    else if (b.dataset.act === 'block') {
      confirmDialog('Block this account?', '<p><b>' + esc(label) + '</b> leaves the list and won’t come back to it, however often they sign in. You can still give them a role later from Add someone by email.</p><p class="sub">The audit log records it with your name.</p>', [
        { label: 'Cancel' },
        { label: 'Block', cls: 'danger', run: async () => { const p = await settle(r, 'block'); return p; } },
      ]);
    }
  });
  $('staffInvites').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cancel]');
    if (!b) return;
    const inv = st.invites.find((x) => x.email === b.dataset.cancel);
    confirmDialog('Cancel this invite?', '<p><b>' + esc(inv.email) + '</b> won’t get <b>' + esc(nameOf(inv.role)) + '</b> when they sign in.</p><p class="sub">The audit log records it with your name.</p>', [
      { label: 'Keep it' },
      {
        label: 'Cancel invite',
        cls: 'danger',
        run: async () => {
          try {
            await ctx.call('adminConsole', { action: 'staff.cancelInvite', email: inv.email });
            toast('Invite for ' + esc(inv.email) + ' cancelled.');
            load();
            return null;
          } catch (err) {
            return failureText(err);
          }
        },
      },
    ]);
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
    st.invites = res.invites || [];
    st.requests = res.requests || [];
    ctx.setRequests?.(st.requests.length);
    conn.hidden = true;
  } catch (err) {
    conn.hidden = false;
    conn.textContent = failureText(err);
  }
  st.loaded = true;
  render();
}

/** One tap: the role now (Labeller, the common case), no dialog; the toast says what happened. */
async function give(r, role, button) {
  button.disabled = true;
  try {
    await ctx.call('adminConsole', { action: 'staff.set', uid: r.uid, role });
    toast(esc(r.email || r.name || r.uid) + ' is ' + esc(nameOf(role)) + ' now. Their page opens to it on its own.', 6000);
    load();
  } catch (err) {
    button.disabled = false;
    toast(esc(failureText(err)), 6000, true);
  }
}

async function settle(r, decision, button) {
  if (button) button.disabled = true;
  try {
    await ctx.call('adminConsole', { action: 'staff.request', uid: r.uid, decision });
    toast(esc(r.email || r.name || r.uid) + (decision === 'block' ? ' is blocked.' : ' dismissed. If they sign in again, they’re back on the list.'), 5000);
    load();
    return null;
  } catch (err) {
    if (button) button.disabled = false;
    return failureText(err);
  }
}

function ask({ uid, email, role, label, from }) {
  const removing = role === 'none';
  const opens = removing ? [] : (st.roles.find((r) => r.role === role) || {}).permissions || [];
  const title = removing ? 'Take this role away?' : from ? 'Change this role?' : email ? 'Add them with this role?' : 'Give this role?';
  const line = removing
    ? '<b>' + esc(label) + '</b> loses <b>' + esc(nameOf(from)) + '</b>. It stops working at their next action in the console.'
    : '<b>' + esc(label) + '</b> becomes <b>' + esc(nameOf(role)) + '</b>' + (from ? ' (now ' + esc(nameOf(from)) + ')' : '') + '. They can:';
  const list = opens.length ? '<ul class="staff-opens">' + opens.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '';
  confirmDialog(title, '<p>' + line + '</p>' + list + '<p class="sub">The audit log records it with your name.</p>', [
    { label: 'Cancel' },
    {
      label: removing ? 'Take it away' : from ? 'Change role' : email ? 'Add' : 'Give role',
      cls: removing ? 'danger' : 'primary',
      run: async () => {
        try {
          const res = await ctx.call('adminConsole', { action: 'staff.set', role, ...(uid ? { uid } : { email }) });
          toast(
            res.invited
              ? 'Invited ' + esc(label) + ' as ' + esc(nameOf(role)) + '. The role attaches when they first sign in with this email.'
              : res.changed ? esc(label) + (removing ? ' has no role now.' : ' is ' + esc(nameOf(role)) + ' now.') : 'Nothing changed: ' + esc(label) + ' already had that.',
            6000,
          );
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
    $('staffRole').innerHTML = roleOptions('labeller');
  }
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : dayYear(t);
  };
  $('staffReqSub').textContent = st.requests.length
    ? st.requests.length + (st.requests.length === 1 ? ' person' : ' people') + ' signed in without a role. They see nothing until you act.'
    : 'Nobody is waiting. When someone signs in to the console without a role, they show up here.';
  $('staffReqs').innerHTML = st.requests
    .map((r) => {
      const initial = esc(String(r.name || r.email || '?').trim().charAt(0).toUpperCase());
      const face = r.photo
        ? '<img class="req-face" src="' + esc(r.photo) + '" alt="" referrerpolicy="no-referrer" loading="lazy">'
        : '<span class="req-face">' + initial + '</span>';
      return '<div class="req">' +
        '<div class="req-who">' + face + '<div class="req-id"><b>' + esc(r.name || r.email || r.uid) + '</b>' +
        (r.name && r.email ? '<span>' + esc(r.email) + '</span>' : '') +
        '<span class="sub">' + esc(r.method) + (r.verified ? '' : ' · email not verified') + ' · ' + (r.attempts > 1 ? r.attempts + ' tries, last ' : '') + esc(ago(r.lastAt)) + '</span></div></div>' +
        '<div class="req-acts">' +
        '<button type="button" class="btn primary" data-act="labeller" data-uid="' + esc(r.uid) + '">Give Labeller</button>' +
        '<span class="req-other"><select data-uid="' + esc(r.uid) + '" aria-label="Another role for ' + esc(r.email || r.uid) + '">' + roleOptions('reviewer') + '</select>' +
        '<button type="button" class="btn" data-act="role" data-uid="' + esc(r.uid) + '">Give</button></span>' +
        '<button type="button" class="btn" data-act="dismiss" data-uid="' + esc(r.uid) + '">Dismiss</button>' +
        '<button type="button" class="btn danger-text" data-act="block" data-uid="' + esc(r.uid) + '">Block</button>' +
        '</div></div>';
    })
    .join('');
  $('staffInvitesBox').hidden = !st.invites.length;
  $('staffInvites').querySelector('tbody').innerHTML = st.invites
    .map((i) =>
      '<tr><td>' + esc(i.email) + '</td><td>' + esc(nameOf(i.role)) + '</td><td>' + esc(dayYear(i.at)) + (i.by && i.by.email ? ' <span class="sub">by ' + esc(i.by.email) + '</span>' : '') + '</td>' +
      '<td><button type="button" class="btn sm" data-cancel="' + esc(i.email) + '">Cancel</button></td></tr>')
    .join('');
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
