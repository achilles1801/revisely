// Revo's sheet with the keyboard up (REVO-24) and its button (REVO-25). On Majd's iPhone (Nov 7
// 2026) the keyboard pushed the whole full-height sheet up: its header and greeting went off the
// top, leaving the chips and the composer over the keyboard.
import fc from 'fast-check';
import { REVO_KEYBOARD_PAD, REVO_TOP_GAP, keyboardCover, keyboardOverSheet, revoSheetFit } from '../../../src/lib/revo/sheetFit';
import { REVO_BUTTON_FOOTPRINT, REVO_BUTTON_GAP, REVO_BUTTON_SIZE } from '../../../src/lib/revo/presence';
import { runs } from './fixtures';

/** Phones from the iPhone SE (667, status bar 20) to the Pro Max (956, 62), and Android sizes between. */
const phone = fc.record({
  frameHeight: fc.integer({ min: 640, max: 1000 }),
  top: fc.integer({ min: 20, max: 62 }),
  keyboard: fc.integer({ min: 0, max: 420 }),
  medium: fc.boolean(),
});

describe('the sheet with the keyboard (REVO-24)', () => {
  it('[REVO-24] the sheet sits on the keyboard, no taller than the room above it: its top (the header) stays below the status bar', () => {
    fc.assert(
      fc.property(phone, ({ frameHeight, top, keyboard, medium }) => {
        const full = frameHeight - top - REVO_TOP_GAP;
        const target = medium ? Math.round(frameHeight * 0.55) : full;
        const fit = revoSheetFit({ frameHeight, top, keyboard, target });
        const sheetTop = frameHeight - fit.lift - fit.height;
        expect(fit.lift).toBe(keyboard); // its bottom on the keyboard: the composer rides up
        expect(sheetTop).toBeGreaterThanOrEqual(top + REVO_TOP_GAP); // the header stays on screen
        expect(fit.height).toBeLessThanOrEqual(target);
        if (keyboard === 0) expect(fit.height).toBe(target); // no keyboard, no change
      }),
      { numRuns: runs(300) },
    );
  });

  it('[REVO-24] on an iPhone SE and a Pro Max, a full sheet keeps room for the header, a message and the composer', () => {
    // QuickType keyboards: SE 667 tall, 20 status bar, keyboard 260; Pro Max 956, 62, 346.
    for (const [frameHeight, top, keyboard] of [
      [667, 20, 260],
      [956, 62, 346],
    ]) {
      const fit = revoSheetFit({ frameHeight, top, keyboard, target: frameHeight - top - REVO_TOP_GAP });
      expect(frameHeight - fit.lift - fit.height).toBe(top + REVO_TOP_GAP);
      // Handle 22 + header 44 + a line of conversation ~60 + chips 48 + composer 52 + padding.
      expect(fit.height).toBeGreaterThanOrEqual(22 + 44 + 60 + 48 + 52 + REVO_KEYBOARD_PAD);
    }
  });

  it('[REVO-24] where the window was resized for the keyboard (Android), only what is still covered lifts the sheet', () => {
    fc.assert(
      fc.property(fc.integer({ min: 600, max: 1000 }), fc.integer({ min: 0, max: 420 }), fc.integer({ min: 0, max: 420 }), (base, keyboard, resizedBy) => {
        const shrink = Math.min(resizedBy, keyboard);
        const cover = keyboardCover(keyboard, base, base - shrink);
        expect(cover).toBe(keyboard - shrink);
        expect(keyboardCover(keyboard, base, base)).toBe(keyboard); // iOS: never resized
        expect(keyboardCover(0, base, base)).toBe(0);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[REVO-24] Android reports the keyboard less the navigation bar: the bar is added back, so the composer clears the keyboard; iOS as reported', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 420 }), fc.integer({ min: 0, max: 48 }), (reported, bar) => {
        expect(keyboardOverSheet(reported, 'android', bar)).toBe(reported + bar);
        expect(keyboardOverSheet(reported, 'ios', 34)).toBe(reported);
        expect(keyboardOverSheet(0, 'android', bar)).toBe(0); // no keyboard, no cover
      }),
      { numRuns: runs(100) },
    );
  });
});

describe('the button (REVO-25)', () => {
  it('[REVO-25] a 44pt disc (smaller than the 56 that shipped first), and lists leave room for it above the tab bar', () => {
    expect(REVO_BUTTON_SIZE).toBe(44);
    expect(REVO_BUTTON_FOOTPRINT).toBeGreaterThanOrEqual(REVO_BUTTON_SIZE + REVO_BUTTON_GAP);
  });
});
