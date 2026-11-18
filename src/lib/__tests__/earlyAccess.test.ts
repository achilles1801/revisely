// Premium early access's words and switch (lib/earlyAccess; BEHAVIOUR.md PREM-1).
jest.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }) }));
jest.mock('../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('../../services/firestoreService', () => ({ callFunction: jest.fn() }));
import {
  EARLY_ACCESS_KEPT_LINE,
  EARLY_ACCESS_LINE,
  EARLY_ACCESS_INTRO_LINE,
  earlyAccessLine,
  earlyAccessOf,
  earlyAccessShortLine,
} from '../earlyAccess';

const ALL = [EARLY_ACCESS_LINE, EARLY_ACCESS_KEPT_LINE, EARLY_ACCESS_INTRO_LINE];

describe('early access', () => {
  it('is on only for exactly true in config/app', () => {
    expect(earlyAccessOf(true)).toBe(true);
    for (const v of [undefined, null, false, 'true', 1, {}]) expect(earlyAccessOf(v)).toBe(false);
  });

  it('[PREM-1] while on, says Premium is free for everyone in early access, with no end date yet, paid later, and kept for life', () => {
    expect(earlyAccessLine({ has: true, early: true }, true)).toBe(EARLY_ACCESS_LINE);
    expect(earlyAccessLine({ has: true, early: false }, true)).toBe(EARLY_ACCESS_LINE);
    expect(EARLY_ACCESS_LINE).toMatch(/free for everyone who signs up during early access, which has no end date yet/);
    expect(EARLY_ACCESS_LINE).toMatch(/keeps it for life/);
    expect(EARLY_ACCESS_INTRO_LINE).toMatch(/no end date yet.*keep it for life/);
    expect(earlyAccessShortLine({ has: true, early: true }, true)).toBe('Premium is free for everyone during early access, and yours for life.');
    expect(earlyAccessLine({ has: false, early: false }, true)).toBeNull();
  });

  it('[PREM-1] after early access, an account that had it is told it keeps it; any other says nothing', () => {
    expect(earlyAccessLine({ has: true, early: true }, false)).toBe(EARLY_ACCESS_KEPT_LINE);
    expect(earlyAccessShortLine({ has: true, early: true }, false)).toMatch(/for life/);
    expect(earlyAccessLine({ has: true, early: false }, false)).toBeNull();
    expect(earlyAccessShortLine({ has: true, early: false }, false)).toBeNull();
  });

  it('never says "trial", a price or a date (the stores read "trial" as a subscription trial)', () => {
    const lines = [...ALL, earlyAccessShortLine({ has: true, early: true }, true), earlyAccessShortLine({ has: true, early: true }, false)];
    for (const line of lines) {
      expect(line).not.toMatch(/trial|\$|£|€|\d|free for \d|until /i);
      expect(line).toMatch(/Premium/);
    }
  });
});
