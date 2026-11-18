// On dev.revisely.app (ACCOUNT_PAGES "1"), the site's own pages (production's home, support, privacy, terms…) get the
// account, Premium and Open Door pages in their navigation: Premium and Open Door in the header and the footer, the
// account button, and a phone menu. revisely.app never sets ACCOUNT_PAGES, so its HTML never carries a link to a page
// that answers 404 there. The account, Premium and Open Door pages have this navigation in their own markup and are
// left alone (they mark their nav data-acct-nav).
// The same pages get Arabic here too (Majd, Nov 15 2026: "languages: Arabic only for now"): the language switch, the
// language and direction set before the first paint, strings-site.js (the home's and Support's Arabic) and
// site-rtl.css. Their HTML carries the keys (data-t…) and its own English, so revisely.app shows them unchanged.

const PERSON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c.9-3.3 3.6-5.1 7-5.1s6.1 1.8 7 5.1"/></svg>';
const BARS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

const HEAD_LINKS =
  '\n        <a class="hide-sm" href="/premium/" data-t="nav.premium">Premium</a>' +
  '\n        <a class="hide-sm" href="/apply/" data-t="nav.program">Open Door</a>';
const ACCOUNT_BUTTON = `<a class="acct-btn" href="/account/" data-account-btn aria-label="Sign in">${PERSON}</a>`;
const LANG_BUTTON = '<button class="lang" type="button" data-lang-switch data-t="lang">عربي</button>';
/** Before the first paint, as the account pages do: ?lang=ar|en, else the switch's choice, else the browser's. */
const LANG_SCRIPT = `<script>(function () {
    var d = document.documentElement, l;
    try { l = localStorage.getItem('rv.lang'); } catch (e) {}
    var q = /[?&]lang=(ar|en)\\b/.exec(location.search);
    if (q) { l = q[1]; try { localStorage.setItem('rv.lang', l); } catch (e) {} }
    if (l !== 'ar' && l !== 'en') l = /^ar\\b/i.test(navigator.language || '') ? 'ar' : 'en';
    d.lang = l; d.dir = l === 'ar' ? 'rtl' : 'ltr';
  })();</script>`;
const MENU_BUTTON = `<button class="menu-btn" type="button" data-menu aria-expanded="false" aria-label="Menu">${BARS}</button>`;
const MENU = `
      <div class="menu-panel" data-menu-panel hidden>
        <p class="menu-who" data-menu-who hidden></p>
        <a href="/account/" data-menu-account data-t="nav.signin">Sign in</a>
        <a href="/premium/" data-t="nav.premium">Premium</a>
        <a href="/apply/" data-t="nav.program">Open Door</a>
        <a href="/support/" data-t="nav.support">Support</a>
        <hr data-menu-signout hidden>
        <button type="button" data-menu-signout data-t="a.signout" hidden>Sign out</button>
      </div>`;
const FOOT_LINKS =
  '\n        <a href="/premium/" data-t="nav.premium">Premium</a>' +
  '\n        <a href="/apply/" data-t="nav.program">Open Door</a>' +
  '\n        <a href="/account/" data-t="nav.account">Account</a>';

/** The page with the account navigation added (unchanged if it already has it). */
export function injectAccountNav(html: string): string {
  if (html.includes('data-acct-nav')) return html;
  let out = html.replace(/<nav class="site-nav" aria-label="Main">([\s\S]*?)<\/nav>/, (_m, inner: string) => {
    // The account goes before the Download pill; the menu last.
    const withAccount = /<a class="pill"/.test(inner)
      ? inner.replace(/<a class="pill"/, `${LANG_BUTTON}\n        ${ACCOUNT_BUTTON}\n        <a class="pill"`)
      : `${inner}  ${LANG_BUTTON}\n        ${ACCOUNT_BUTTON}\n      `;
    return `<nav class="site-nav" aria-label="Main" data-acct-nav>${HEAD_LINKS}${withAccount.replace(/\s*$/, '')}\n        ${MENU_BUTTON}\n      </nav>${MENU}`;
  });
  out = out.replace('<nav aria-label="Footer">', `<nav aria-label="Footer" data-acct-nav>${FOOT_LINKS}`);
  if (out === html) return html; // no site navigation on this page
  out = out.replace(
    '</head>',
    `  ${LANG_SCRIPT}\n  <link rel="stylesheet" href="/assets/account-nav.css">\n  <link rel="stylesheet" href="/assets/site-rtl.css">\n</head>`,
  );
  const scripts =
    (out.includes('/assets/strings.js') ? '' : '<script src="/assets/strings.js"></script>\n') +
    '<script src="/assets/strings-site.js"></script>\n' +
    (out.includes('/assets/site-i18n.js') ? '' : '<script src="/assets/site-i18n.js"></script>\n') +
    '<script type="module" src="/assets/account-nav.js"></script>\n';
  return out.replace('</body>', `${scripts}</body>`);
}

/** An HTML page from the assets, changed by `change` (the account navigation, the Recite section); anything else as it was. */
export async function withPageChange(res: Response, change: (html: string) => string): Promise<Response> {
  if (res.status !== 200 || !(res.headers.get('Content-Type') ?? '').includes('text/html')) return res;
  const out = new Response(change(await res.text()), res);
  out.headers.delete('Content-Length');
  out.headers.delete('ETag');
  return out;
}
