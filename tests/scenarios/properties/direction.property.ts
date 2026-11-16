// The layout direction follows the app's language, not the phone's (src/i18n/direction.ts).

import fc from 'fast-check';
import { isRTLLanguage, syncLayoutDirection } from '../../../src/i18n/direction';
import { runs } from './fixtures';

/** React Native's I18nManager as it starts: right to left or not, as the phone and last launch left it. */
function manager(isRTL: boolean) {
  const calls: { allowRTL?: boolean; forceRTL?: boolean } = {};
  return {
    calls,
    isRTL,
    allowRTL: (v: boolean) => void (calls.allowRTL = v),
    forceRTL: (v: boolean) => void (calls.forceRTL = v),
  };
}

const phoneLanguages = fc.constantFrom('en', 'en-GB', 'ar', 'ar-SA', 'ar_EG', 'fa-IR', 'he', 'ur-PK', 'fr-FR', 'tr', 'id');

describe('the layout direction', () => {
  it('[LANG-1] English lays out left to right from the next launch, whatever the phone is set to', () => {
    fc.assert(
      fc.property(fc.boolean(), (startedRTL) => {
        const m = manager(startedRTL);
        const wrongWay = syncLayoutDirection('en', m);
        expect(m.calls).toEqual({ allowRTL: false, forceRTL: false });
        // A phone set to Arabic started mirrored this once; the next launch is left to right.
        expect(wrongWay).toBe(startedRTL);
      }),
      { numRuns: runs(10) },
    );
  });

  it('[LANG-1] a right-to-left language lays out right to left, and only those do', () => {
    fc.assert(
      fc.property(phoneLanguages, fc.boolean(), (language, startedRTL) => {
        const m = manager(startedRTL);
        const rtl = ['ar', 'fa', 'he', 'ur'].includes(language.slice(0, 2));
        expect(isRTLLanguage(language)).toBe(rtl);
        syncLayoutDirection(language, m);
        expect(m.calls).toEqual({ allowRTL: rtl, forceRTL: rtl });
      }),
      { numRuns: runs(40) },
    );
  });
});
