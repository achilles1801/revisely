// Small pieces the console's newer views share (Staff; Premium and Accounts to come): escaping, dates, the toast and
// the confirm dialog over the page's #toast and #modal. Open Door keeps its own copies (it has Undo).

const $ = (id) => document.getElementById(id);

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const dayYear = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const dayTime = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** What a refused or failed call says, in words a person can act on. */
export function failureText(err) {
  const code = String((err && err.code) || '').replace('functions/', '');
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal') return 'The console didn’t answer. Try again.';
  return (err && err.message) || 'That didn’t work. Try again.';
}

let toastTimer = 0;
export function toast(html, ms = 4000, bad = false) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.className = 'toast' + (bad ? ' bad' : '');
  t.innerHTML = '<span>' + html + '</span>';
  t.hidden = false;
  if (ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/**
 * A dialog with buttons; the last is the primary one (Enter in an input presses it). An action's `run` returns the
 * words of a problem to show (the dialog stays), or nothing to close it.
 */
export function confirmDialog(title, bodyHtml, actions, focusId) {
  const m = $('modal');
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml + '<p class="auth-err" id="modalErr" hidden></p>';
  const bar = $('modalActions');
  bar.innerHTML = '';
  const close = () => { m.hidden = true; document.removeEventListener('keydown', onKey, true); };
  const err = (text) => { $('modalErr').hidden = !text; $('modalErr').textContent = text || ''; };
  const runAction = async (a, btn) => {
    if (!a.run) return close();
    btn.disabled = true;
    const problem = await a.run();
    btn.disabled = false;
    if (problem) err(problem);
    else close();
  };
  actions.forEach((a, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.addEventListener('click', () => runAction(a, b));
    bar.appendChild(b);
    if (i === actions.length - 1) b.dataset.primary = '1';
  });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      const b = bar.querySelector('[data-primary]');
      if (b && !b.disabled) runAction(actions[actions.length - 1], b);
    }
  };
  document.addEventListener('keydown', onKey, true);
  m.onclick = (e) => { if (e.target === m) close(); };
  m.hidden = false;
  setTimeout(() => (focusId ? $(focusId) : bar.querySelector('button')).focus(), 0);
}
