/**
 * @jest-environment node
 */
// The home's Recite section (mistake detection) is on dev.revisely.app only until the release (worker/recite.ts).
// revisely.app serves its home straight from the assets, so two things keep it off there: its config never sets
// RECITE_SECTION, and the page as it is in docs/ keeps the section hidden (site.css, unless <body> has recite-on).
//
// At the release: <body class="home recite-on"> in docs/index.html turns it on for both sites, and RELEASED below
// becomes true in the same change.
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

import worker from '../index';
import { RECITE_ON, showReciteSection } from '../recite';

const RELEASED = false;

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** A wrangler config (JSON with comments), read the way TypeScript reads tsconfig.json. */
function wrangler(file: string): { vars?: Record<string, string>; previews?: { vars?: Record<string, string> } } {
  const { config, error } = ts.parseConfigFileTextToJson(file, read(file));
  if (error) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
  return config;
}

const home = read('docs/index.html');
const homeBody = () => /<body class="([^"]*)">/.exec(home)?.[1].split(/\s+/) ?? [];

const ctx = () => ({ waitUntil: () => {}, passThroughOnException: () => {} });
const assets = (body: string) => ({
  fetch: jest.fn(async () => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
});
// What the site's part of the worker needs; the API's settings don't matter here.
const ENV = { FIREBASE_PROJECT_ID: 'x', TCQ_API_BASE_LIVE: '', TCQ_API_BASE_SANDBOX: '' } as never;

describe("the home's Recite section", () => {
  it("revisely.app's config leaves it off, and dev.revisely.app's turns it on", () => {
    const prod = wrangler('wrangler.jsonc');
    expect(prod.vars?.RECITE_SECTION).toBeUndefined();
    expect(prod.previews?.vars?.RECITE_SECTION).toBeUndefined();
    expect(wrangler('wrangler.dev.jsonc').vars?.RECITE_SECTION).toBe('1');
  });

  it('revisely.app serves the home as it is in docs/, which keeps the section hidden until the release', () => {
    expect(homeBody()).toContain('home');
    expect(homeBody().includes(RECITE_ON)).toBe(RELEASED);
    // The section and its header link are the ones marked; site.css hides them unless <body> has recite-on.
    expect(home).toMatch(/<section class="recite" id="mistakes"[^>]* data-when="RECITE_SECTION">/);
    expect(home).toMatch(/<a [^>]*href="#mistakes" data-when="RECITE_SECTION"/);
    expect(read('docs/assets/site.css')).toContain(
      `body.home:not(.${RECITE_ON}) [data-when="RECITE_SECTION"] { display: none !important; }`,
    );
  });

  it('the worker shows it only where RECITE_SECTION is "1"', async () => {
    const off = await worker.fetch(new Request('https://revisely.app/'), { ...ENV, ASSETS: assets(home) }, ctx());
    expect(await off.text()).toBe(home);

    const on = await worker.fetch(new Request('https://dev.revisely.app/'), { ...ENV, ASSETS: assets(home), RECITE_SECTION: '1' }, ctx());
    const body = await on.text();
    expect(body).toContain(`<body class="home ${RECITE_ON}">`);
    expect(body.replace(` ${RECITE_ON}"`, '"')).toBe(home);

    // With the account navigation too (dev.revisely.app sets both).
    const both = await worker.fetch(
      new Request('https://dev.revisely.app/'),
      { ...ENV, ASSETS: assets(home), RECITE_SECTION: '1', ACCOUNT_PAGES: '1' },
      ctx(),
    );
    const page = await both.text();
    expect(page).toContain(`<body class="home ${RECITE_ON}">`);
    expect(page).toContain('data-account-btn');
  });

  it('adds the class to the home only, once, keeping its other classes', () => {
    expect(showReciteSection('<body class="home">')).toBe(`<body class="home ${RECITE_ON}">`);
    expect(showReciteSection('<body class="home x">')).toBe(`<body class="home x ${RECITE_ON}">`);
    expect(showReciteSection(`<body class="home ${RECITE_ON}">`)).toBe(`<body class="home ${RECITE_ON}">`);
    const support = read('docs/support/index.html');
    expect(showReciteSection(support)).toBe(support);
  });

  it('every screen it shows is there, light and dark', () => {
    const section = home.slice(home.indexOf('<section class="recite"'), home.indexOf('<section class="revo"'));
    const files = [...section.matchAll(/(?:src|srcset)="\/(assets\/img\/recite\/[^"]+)"/g)].map((m) => m[1]);
    expect(files).toHaveLength(8);
    for (const f of files) expect(fs.statSync(path.join(ROOT, 'docs', f)).size).toBeGreaterThan(10_000);
    for (const name of ['follow', 'marks', 'again', 'test']) {
      expect(files).toEqual(expect.arrayContaining([`assets/img/recite/${name}-light.webp`, `assets/img/recite/${name}-dark.webp`]));
    }
  });
});
