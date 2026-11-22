// The layout direction follows the app's language, not the phone's (src/i18n/direction.ts).

import fc from 'fast-check';
import { languagePickerOffered, offeredLanguages, resolveChoice } from '../../../src/i18n/choice';
import { fromLeftEdge, isRTLLanguage, restartForDirection, syncLayoutDirection } from '../../../src/i18n/direction';
import { SHIPPED } from '../../../src/i18n/language';
import { pageIndexAt, pagerLayout } from '../../../src/lib/mushafDirection';
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

  it('[LANG-1] a launch that started the wrong way restarts once, never in tests or E2E builds, and never loops', () => {
    const wanted = fc.constantFrom('rtl' as const, 'ltr' as const);
    const lastRestart = fc.constantFrom(null, 'rtl', 'ltr');
    fc.assert(
      fc.property(phoneLanguages, fc.boolean(), lastRestart, fc.boolean(), (language, startedRTL, restartedFor, pinned) => {
        const m = manager(startedRTL);
        const wrongWay = syncLayoutDirection(language, m);
        const want = isRTLLanguage(language) ? 'rtl' : 'ltr';
        const restart = restartForDirection(wrongWay, want, restartedFor, pinned);
        // Only the wrong way round, outside tests, and not twice for the same direction.
        expect(restart).toBe(wrongWay && !pinned && restartedFor !== want);
        // The launch after a restart that took is the right way: no second restart.
        const after = manager(isRTLLanguage(language));
        expect(restartForDirection(syncLayoutDirection(language, after), want, want, pinned)).toBe(false);
      }),
      { numRuns: runs(40) },
    );
    // A restart that didn't take: the launch after it is still the wrong way, and carries on as it is.
    fc.assert(
      fc.property(wanted, (want) => expect(restartForDirection(true, want, want, false)).toBe(false)),
      { numRuns: runs(4) },
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

  it('[LANG-2] the mushaf keeps a printed order in either direction, and a drag finds the page under the finger', () => {
    // Left to right `inverted` gives page 1 on the right; right to left the list's own order does, unpinned.
    expect(pagerLayout(false)).toEqual({ inverted: true, listDirection: 'ltr' });
    expect(pagerLayout(true)).toEqual({ inverted: false });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 605 }), fc.integer({ min: 200, max: 1400 }), (count, width) => {
        const index = (count * 7919) % count;
        // The native list sends its offset from the content's left edge.
        expect(pageIndexAt(index * width, count * width, width, width, count, false)).toBe(index);
        expect(pageIndexAt((count - 1 - index) * width, count * width, width, width, count, true)).toBe(index);
      }),
      { numRuns: runs(50) },
    );
  });

  it('[LANG-2] a menu placed from a touch stays where the touch was, right to left too', () => {
    expect(fromLeftEdge(42, false)).toEqual({ left: 42 });
    // React Native swaps left and right in RTL: `right` is the screen's left edge there.
    expect(fromLeftEdge(42, true)).toEqual({ right: 42 });
  });
});

describe('the language', () => {
  const choices = fc.constantFrom('system' as const, 'en' as const, 'ar' as const);
  const phones = fc.array(phoneLanguages, { maxLength: 3 });

  it('[LANG-3] the store app comes in English and Arabic: the phone\'s language when it has it, else English; a choice wins', () => {
    expect(offeredLanguages(false)).toEqual(['en', 'ar']);
    expect(SHIPPED).toEqual(['en', 'ar']);
    expect(languagePickerOffered(false, false)).toBe(true);
    fc.assert(
      fc.property(choices, phones, (choice, phone) => {
        const shown = resolveChoice(choice, phone, offeredLanguages(false), false);
        const firstKnown = phone.map((tag) => tag.slice(0, 2)).find((base) => base === 'en' || base === 'ar');
        expect(shown).toBe(choice === 'system' ? (firstKnown ?? 'en') : choice);
      }),
      { numRuns: runs(60) },
    );
  });

  it('[LANG-3] tests and E2E builds are English, whatever was chosen, and never offer the choice', () => {
    fc.assert(
      fc.property(choices, phones, fc.boolean(), (choice, phone, dev) => {
        expect(resolveChoice(choice, phone, offeredLanguages(dev), true)).toBe('en');
        expect(languagePickerOffered(dev, true)).toBe(false);
      }),
      { numRuns: runs(30) },
    );
  });
});
