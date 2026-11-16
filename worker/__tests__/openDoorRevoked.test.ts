/**
 * @jest-environment node
 */
// Open Door after a revoke (Majd's option A, Nov 15 2026): supportApplication's status answers "declined" with
// `revokedAt` (functions/src/support/logic.ts, stateOf), and /account and /apply say the free Premium ended, in
// English and Arabic, instead of "Not approved this time". A plain decline reads as before.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

type Strings = Record<'en' | 'ar', Record<string, string>>;

function strings(): Strings {
  const ctx: { window: { RV_STRINGS?: Strings } } = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('docs/assets/strings.js'), ctx);
  return ctx.window.RV_STRINGS!;
}

/** site-i18n.js's t(): {name} filled from vars. */
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

describe('Open Door after a revoke', () => {
  const S = strings();
  const vars = { ended: 'November 15', date: 'Tuesday, December 15' };

  it('/apply says the free Premium ended, and when they may apply again', () => {
    expect(fill(S.en['o.revokedT'], vars)).toBe('Your free Premium ended');
    expect(fill(S.en['o.revoked'], vars)).toBe(
      'Your free Premium ended on November 15. Following along as you recite stays free. You can apply again from Tuesday, December 15.',
    );
    expect(S.ar['o.revoked']).toContain('{ended}');
    expect(S.ar['o.revoked']).toContain('{date}');
  });

  it('/account says the same in its card', () => {
    expect(S.en['a.revoked']).toBe('Your free Premium ended');
    expect(fill(S.en['a.revokedLine'], vars)).toBe('It ended on November 15. You can apply again from Tuesday, December 15.');
    expect(S.ar['a.revokedLine']).toContain('{ended}');
    expect(S.ar['a.revokedLine']).toContain('{date}');
  });

  it('no wording says "not approved" or gives a reason', () => {
    for (const lang of ['en', 'ar'] as const) {
      for (const key of ['o.revokedT', 'o.revoked', 'a.revoked', 'a.revokedLine']) {
        expect(S[lang][key]).toBeTruthy();
        expect(S[lang][key]).not.toMatch(/approved|because|reason/i);
      }
    }
  });

  it('the pages pick the revoked words only when the answer has revokedAt', () => {
    const apply = read('docs/assets/apply.js');
    expect(apply).toMatch(/s\.revokedAt\s*\?\s*status\(\{ title: RV\.t\('o\.revokedT'\)/);
    expect(apply).toContain("RV.t('o.declinedT')");
    const account = read('docs/assets/account.js');
    expect(account).toMatch(/if \(s\.revokedAt\) \{\s*fill\('appTitle', RV\.t\('a\.revoked'\)\)/);
    expect(account).toContain("RV.t('a.declined')");
  });
});
