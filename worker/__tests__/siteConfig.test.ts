/**
 * @jest-environment node
 */
// revisely.app's config (wrangler.jsonc) against dev.revisely.app's (wrangler.dev.jsonc): the sign-in gate and the
// request for search engines to stay away are dev's only (Majd, Nov 18 2026: "obviously u don't need to sign in to view
// the website that was just for dev so that only i can see it"). The gate's own behaviour is gate.test.ts.
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

type Config = { vars?: Record<string, string>; previews?: { vars?: Record<string, string> } };

function wrangler(file: string): Config {
  const text = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
  const { config, error } = ts.parseConfigFileTextToJson(file, text);
  if (error) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
  return config;
}

describe("revisely.app's config", () => {
  const prod = wrangler('wrangler.jsonc');
  const dev = wrangler('wrangler.dev.jsonc');

  it('never turns the dev sign-in gate on, in production or its previews', () => {
    expect(prod.vars?.DEV_GATE).toBeUndefined();
    expect(prod.previews?.vars?.DEV_GATE).toBeUndefined();
    expect(dev.vars?.DEV_GATE).toBe('1');
  });

  it('never asks search engines to leave revisely.app alone', () => {
    expect(prod.vars?.NOINDEX).toBeUndefined();
    expect(prod.previews?.vars?.NOINDEX).toBeUndefined();
    expect(dev.vars?.NOINDEX).toBe('1');
  });

  it("signs in to production's Firebase project, and dev to dev's", () => {
    expect(prod.vars?.FIREBASE_PROJECT_ID).toBe('revision-buddy-3a398');
    expect(prod.vars?.FIREBASE_HOSTING).toBe('revision-buddy-3a398.web.app');
    expect(dev.vars?.FIREBASE_PROJECT_ID).toBe('revisely-dev');
    expect(dev.vars?.FIREBASE_HOSTING).toBe('revisely-dev.web.app');
  });
});
