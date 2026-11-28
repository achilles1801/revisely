// Every kind of user (tests/scenarios/USER-MATRIX.md): accounts generated across the matrix (how much is memorized,
// the plan, the days before today and today itself, the settings, the clock), run through what each screen shows,
// with the app's own code, and checked against the rules every screen keeps (the accounts and the checks:
// userMatrixCases.ts).
//
// Majd, Nov 27 2026, after Home showed a new account's "Mark memorized pages" on a rest day of his plan (HOME-9): "can
// we have a session sweep through all different possible scenarios that could arise from every type of user so we can
// make sure we take into account every single case and edge case so bugs like this never come again".

import fc from 'fast-check';
import { i18n } from '../../../src/i18n';
import { restoreZone, runs } from './fixtures';
import { build, caseArb, checkForward, checkHome, checkReminders, checkRevo, checkWidget, describe_, flightArb, homeFor, landed } from './userMatrixCases';
import { scheduleStartingByToday } from '../../../src/lib/algorithm';

// Revisely Dev or the store app, per generated account (lib/variant).
jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => mockApp.dev }));
const mockApp = { dev: false };

afterEach(() => {
  restoreZone();
  mockApp.dev = false;
});
afterAll(async () => {
  await i18n.changeLanguage('en');
});

// ---------------------------------------------------------------------------

describe('Every kind of user (USER-MATRIX.md)', () => {
  it('[HOME-9] [USER-1] Home never offers the new account\'s state while pages are memorized, and its button does what it says, for every kind of user', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        mockApp.dev = c.dev;
        const b = build(c);
        const home = homeFor(b);
        try {
          checkHome(home, 'English');
        } catch (err) {
          throw new Error(`${(err as Error).message}\n${describe_(c, b, home)}`);
        }
      }),
      { numRuns: runs(400) },
    );
  });

  it('[USER-2] Home, the widget, the reminders and Revo agree about today, and none shows a broken line', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        mockApp.dev = c.dev;
        const b = build(c);
        const home = homeFor(b);
        try {
          checkWidget(b, home);
          checkReminders(b, home);
          checkRevo(b, home);
        } catch (err) {
          throw new Error(`${(err as Error).message}\n${describe_(c, b, home)}`);
        }
      }),
      { numRuns: runs(250) },
    );
  });

  it('[USER-1] [LANG-1] in Arabic, Home\'s lines are as whole, for every kind of user', async () => {
    await i18n.changeLanguage('ar');
    try {
      fc.assert(
        fc.property(caseArb, (c) => {
          mockApp.dev = c.dev;
        const b = build(c);
          const home = homeFor(b);
          try {
            checkHome(home, 'Arabic');
          } catch (err) {
            throw new Error(`${(err as Error).message}\n${describe_(c, b, home)}`);
          }
        }),
        { numRuns: runs(150) },
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('[USER-1] [USER-2] [DAY-8] after a flight across the date line or any big jump, every screen still agrees, and the days run forward', () => {
    fc.assert(
      fc.property(caseArb, flightArb, (c, f) => {
        mockApp.dev = c.dev;
        const before = build(c);
        const b = landed(before, f);
        // Home as it first draws, then once it has moved a plan that starts after today to start today (DashboardScreen's
        // repair): both must hold.
        const repaired = scheduleStartingByToday(b.user, b.date);
        for (const at of repaired ? [b, { ...b, user: repaired }] : [b]) {
          const home = homeFor(at);
          try {
            checkHome(home, `after a flight to ${f.zone}`);
            checkWidget(at, home);
            checkReminders(at, home);
            checkRevo(at, home);
            checkForward(at);
          } catch (err) {
            const where = (err as Error).stack?.split('\n').find((l) => l.includes('userMatrixCases')) ?? '';
            throw new Error(`${(err as Error).message}\n${where.trim()}\nflight ${JSON.stringify(f)} from ${before.day} to ${at.day}${at === b ? '' : ' (repaired)'}\n${describe_(c, at, home)}`);
          }
        }
      }),
      { numRuns: runs(250) },
    );
  });
});
