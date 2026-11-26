// Revo in Ramadan (BEHAVIOUR.md THEME-8): its first words and Home's suggestions, and the month so far it is told.

import { ramadanOpener, revoRamadan } from '../ramadan';

const opener = { text: 'Assalamu alaikum, Majd. Today is 5 pages.', chips: ['How was my week?'] };
const D = { start: '2027-02-08', eid: '2027-03-09' };

describe('[THEME-8] Revo’s opener in Ramadan', () => {
  it('opens “Ramadan Kareem” during the month, with the Ramadan suggestions from Home', () => {
    expect(ramadanOpener(opener, 'Majd', { kind: 'during', day: 12, length: 29, lastTen: false }, false)).toEqual({
      text: 'Ramadan Kareem, Majd. Today is 5 pages.',
      chips: ['Plan a khatmah by Eid', 'What should I revise for taraweeh?', 'How’s my Ramadan going?'],
    });
  });

  it('keeps a screen part’s suggestions, and says “Eid Mubarak” on Eid', () => {
    expect(ramadanOpener(opener, 'Majd', { kind: 'during', day: 12, length: 29, lastTen: false }, true).chips).toEqual(opener.chips);
    expect(ramadanOpener(opener, 'Majd', { kind: 'eid', day: 1 }, false)).toEqual({ text: 'Eid Mubarak, Majd. Today is 5 pages.', chips: opener.chips });
    expect(ramadanOpener({ ...opener, text: 'Assalamu alaikum. Today is 5 pages.' }, null, { kind: 'eid', day: 2 }, false).text).toBe('Eid Mubarak. Today is 5 pages.');
  });

  it('changes nothing before or after the month, or with the theme off', () => {
    expect(ramadanOpener(opener, 'Majd', { kind: 'before', daysTo: 10 }, false)).toBe(opener);
    expect(ramadanOpener(opener, 'Majd', { kind: 'after' }, false)).toBe(opener);
    expect(ramadanOpener(opener, 'Majd', null, false)).toBe(opener);
  });
});

describe('[THEME-8] the month so far, for Revo', () => {
  it('has the day, the days revised, the pages since 1 Ramadan and the first page not yet', () => {
    const logs = [{ date: '2027-02-09', pagesRevised: [1, 2, 3], durationMinutes: 10 }];
    const readings = [{ date: '2027-02-10', pages: [5], pagesVisited: [], durationSeconds: 300 }];
    expect(revoRamadan(logs, readings, D, '2027-02-19')).toMatchObject({ day: 12, length: 29, revisedDays: 1, covered: 4, nextPage: 4 });
    expect(revoRamadan(logs, readings, D, '2027-02-19')?.nextWords).toMatch(/Al-Baqarah/);
    expect(revoRamadan(logs, readings, D, '2027-02-07')).toBeNull();
    expect(revoRamadan(logs, readings, D, '2027-03-09')).toBeNull();
  });
});
