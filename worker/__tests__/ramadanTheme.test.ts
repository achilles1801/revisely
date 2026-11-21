/**
 * @jest-environment node
 */
// The site dressed for Ramadan (worker/ramadan.ts, docs/assets/ramadan.css): on dev.revisely.app only, where
// RAMADAN_THEME is "1". revisely.app gets it only on Majd's word, so its config must never set the var.
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import vm from 'vm';

import worker from '../index';
import { RAMADAN_ON, dressesPath, dressForRamadan } from '../ramadan';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** A wrangler config (JSON with comments), read the way TypeScript reads tsconfig.json. */
function wrangler(file: string): { vars?: Record<string, string>; previews?: { vars?: Record<string, string> } } {
  const { config, error } = ts.parseConfigFileTextToJson(file, read(file));
  if (error) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
  return config;
}

/** Every page of the site with the site's header and footer. */
const PAGES = [
  'docs/index.html',
  'docs/support/index.html',
  'docs/privacy/index.html',
  'docs/terms/index.html',
  'docs/donate/index.html',
  'docs/get/index.html',
  'docs/apply/index.html',
  'docs/premium/index.html',
  'docs/account/index.html',
];

const ctx = () => ({ waitUntil: () => {}, passThroughOnException: () => {} });
const assets = (body: string) => ({
  fetch: jest.fn(async () => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
});
// What the site's part of the worker needs; the API's settings don't matter here.
const ENV = { FIREBASE_PROJECT_ID: 'x', TCQ_API_BASE_LIVE: '', TCQ_API_BASE_SANDBOX: '' } as never;
const bodyClasses = (html: string) => /<body(?:\s+class="([^"]*)")?[^>]*>/.exec(html)?.[1]?.split(/\s+/) ?? [];

describe('the Ramadan theme', () => {
  it("revisely.app's config never sets RAMADAN_THEME, and dev.revisely.app's turns it on", () => {
    const prod = wrangler('wrangler.jsonc');
    expect(prod.vars?.RAMADAN_THEME).toBeUndefined();
    expect(prod.previews?.vars?.RAMADAN_THEME).toBeUndefined();
    expect(wrangler('wrangler.dev.jsonc').vars?.RAMADAN_THEME).toBe('1');
  });

  it('no page in docs/ carries it by itself (revisely.app serves them as they are)', () => {
    for (const page of PAGES) {
      expect([page, bodyClasses(read(page)).includes(RAMADAN_ON)]).toEqual([page, false]);
      expect([page, read(page).includes('ramadan.css')]).toEqual([page, false]);
    }
  });

  it('the worker dresses a page only where RAMADAN_THEME is "1"', async () => {
    const support = read('docs/support/index.html');
    const off = await worker.fetch(new Request('https://revisely.app/support/'), { ...ENV, ASSETS: assets(support) }, ctx());
    expect(await off.text()).toBe(support);

    const on = await worker.fetch(
      new Request('https://dev.revisely.app/support/'),
      { ...ENV, ASSETS: assets(support), RAMADAN_THEME: '1' },
      ctx(),
    );
    expect(await on.text()).toBe(dressForRamadan(support));

    // With everything else dev.revisely.app sets.
    const home = read('docs/index.html');
    const all = await worker.fetch(
      new Request('https://dev.revisely.app/'),
      { ...ENV, ASSETS: assets(home), RAMADAN_THEME: '1', RECITE_SECTION: '1', ACCOUNT_PAGES: '1' },
      ctx(),
    );
    const page = await all.text();
    expect(bodyClasses(page)).toEqual(expect.arrayContaining(['home', 'recite-on', RAMADAN_ON]));
    expect(page).toContain('/assets/ramadan.css');
  });

  it('leaves /record (ayat to recite) as it is', async () => {
    expect(dressesPath('/record/')).toBe(false);
    expect(dressesPath('/record')).toBe(false);
    expect(dressesPath('/recordings')).toBe(true);
    expect(dressesPath('/')).toBe(true);
    const record = read('docs/record/index.html');
    const res = await worker.fetch(
      new Request('https://dev.revisely.app/record/'),
      { ...ENV, ASSETS: assets(record), RAMADAN_THEME: '1' },
      ctx(),
    );
    expect(await res.text()).toBe(record);
  });

  it.each(PAGES)('dresses %s once: the greeting, the lights, the hanging ornaments, the footer', (file) => {
    const html = read(file);
    const out = dressForRamadan(html);
    expect(bodyClasses(out)).toEqual([...bodyClasses(html).filter(Boolean), RAMADAN_ON]);
    expect(out.match(/\/assets\/ramadan\.css/g)).toHaveLength(1);
    expect(out.indexOf('/assets/ramadan.css')).toBeLessThan(out.indexOf('</head>'));
    // The strip comes before the header, the lights inside it, the ornaments right after it.
    const header = out.indexOf('<header class="site-header">');
    const headerEnd = out.indexOf('</header>');
    expect(out.indexOf('class="rm-banner"')).toBeGreaterThan(-1);
    expect(out.indexOf('class="rm-banner"')).toBeLessThan(header);
    const lights = out.indexOf('class="rm-lights rm-head"');
    expect(lights).toBeGreaterThan(header);
    expect(lights).toBeLessThan(headerEnd);
    expect(out.indexOf('class="rm-hangers"')).toBeGreaterThan(headerEnd);
    expect(out.indexOf('class="rm-lights rm-foot"')).toBeGreaterThan(out.indexOf('<footer class="site-footer">'));
    // Once only.
    expect(dressForRamadan(out)).toBe(out);
    // Every <use> points at the sprite.
    const ids = new Set([...out.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of out.matchAll(/<use href="#([^"]+)"/g)) expect(ids.has(m[1])).toBe(true);
    // The page's own markup is all still there, in order.
    expect(out.replace(/\s+/g, '')).toContain(html.slice(html.indexOf('<main'), html.indexOf('</main>')).replace(/\s+/g, ''));
  });

  it('the decorations are hidden from screen readers, and the greeting is read once', () => {
    const out = dressForRamadan(read('docs/support/index.html'));
    for (const cls of ['rm-sky', 'rm-lights rm-head', 'rm-lights rm-foot', 'rm-hangers']) {
      expect(out).toMatch(new RegExp(`class="${cls}" aria-hidden="true"`));
    }
    expect(out).toMatch(/<svg class="rm-sprite"[^>]* aria-hidden="true"/);
    // The Arabic beside the English greeting is drawn, and hidden (in Arabic the greeting itself is Arabic).
    expect(out).toContain('<span class="rm-greet-ar" aria-hidden="true">');
    expect((out.match(/data-t="ramadan\.kareem"/g) ?? []).length).toBe(1);
  });

  it('its words are in strings.js, in English and Arabic', () => {
    const c: { window: { RV_STRINGS?: Record<'en' | 'ar', Record<string, string>> } } = { window: {} };
    vm.createContext(c);
    vm.runInContext(read('docs/assets/strings.js'), c);
    const s = c.window.RV_STRINGS!;
    const keys = [...dressForRamadan(read('docs/support/index.html')).matchAll(/data-t="(ramadan\.[^"]+)"/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual(['ramadan.foot', 'ramadan.kareem', 'ramadan.line']);
    for (const k of keys) {
      expect(s.en[k]).toBeTruthy();
      expect(s.ar[k]).toMatch(/[؀-ۿ]/);
    }
    expect(s.ar['ramadan.kareem']).toBe('رمضان كريم');
  });

  describe('ramadan.css', () => {
    const css = read('docs/assets/ramadan.css').replace(/\/\*[\s\S]*?\*\//g, '');

    /** Each rule with the at-rules around it. */
    function rules(): { selector: string; within: string[]; body: string }[] {
      const out: { selector: string; within: string[]; body: string }[] = [];
      const stack: string[] = [];
      let buf = '';
      for (const ch of css) {
        if (ch === '{') {
          stack.push(buf.trim());
          buf = '';
        } else if (ch === '}') {
          const head = stack.pop()!;
          if (!head.startsWith('@')) out.push({ selector: head, within: [...stack], body: buf.trim() });
          buf = '';
        } else buf += ch;
      }
      expect(stack).toEqual([]);
      return out;
    }

    it('changes nothing on a page without body.ramadan: every selector starts from it', () => {
      const plain = rules().filter((r) => !r.within.some((w) => w.startsWith('@keyframes')));
      expect(plain.length).toBeGreaterThan(40);
      const loose = plain.flatMap((r) => r.selector.split(',').map((s) => s.trim())).filter((s) => !s.includes('body.ramadan'));
      expect(loose).toEqual([]);
    });

    it('moves only for those who have not asked for less motion', () => {
      const moving = rules().filter((r) => /(^|;)\s*animation(-name)?\s*:/.test(r.body));
      expect(moving.length).toBeGreaterThan(3);
      for (const r of moving) {
        expect([r.selector, r.within]).toEqual([r.selector, ['@media (prefers-reduced-motion: no-preference)']]);
      }
      expect(css).not.toMatch(/transition\s*:/);
    });

    it('downloads nothing: no fonts, no images but drawn SVG', () => {
      expect(css).not.toMatch(/@font-face|@import/);
      const urls = [...css.matchAll(/url\(("[^"]*"|[^)]*)\)/g)].map((m) => m[1].replace(/^"|"$/g, ''));
      expect(urls.length).toBeGreaterThan(5);
      for (const u of urls) expect(u.startsWith('data:image/svg+xml,') || u.startsWith('#')).toBe(true);
    });
  });
});
