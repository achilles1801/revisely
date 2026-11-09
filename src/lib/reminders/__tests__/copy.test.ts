import { getSurah } from '../../quranData';
import { reminderCopy, type ReminderCopyInput, type ReminderKind } from '../copy';

// Al-Mujadila (58) and At-Tahrim (66) span several pages; these come from the data.
const mujadila = getSurah(58)!;
const tahrim = getSurah(66)!;
const pageRange = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const base = (over: Partial<ReminderCopyInput> & { kind: ReminderKind }): ReminderCopyInput => ({
  juzPlan: false,
  name: 'Maryam',
  beforeNoon: true,
  all: pageRange(mujadila.startPage, tahrim.endPage),
  remaining: pageRange(mujadila.startPage, tahrim.endPage),
  overnight: false,
  streak: 0,
  tomorrow: pageRange(tahrim.endPage + 1, tahrim.endPage + 2),
  variant: 0,
  ...over,
});

describe('reminderCopy', () => {
  it('morning, nothing read: greets by name and names the first and last surah', () => {
    const c = reminderCopy(base({ kind: 'morning' }));
    expect(c.title).toBe('Good morning, Maryam');
    expect(c.body).toBe(`Today's revision: ${mujadila.name} to ${tahrim.name}.`);
  });

  it('midday, nothing read: starts with the first surah', () => {
    const c = reminderCopy(base({ kind: 'midday', beforeNoon: false, name: '' }));
    expect(c.title).toBe(`Starting with ${mujadila.name}`);
    expect(c.body).toBe("A few calm minutes for today's revision?");
  });

  it('midday, most of today done: says so, and names the surah next', () => {
    const all = pageRange(mujadila.startPage, tahrim.endPage);
    const remaining = all.slice(Math.floor(all.length * 0.7));
    const c = reminderCopy(base({ kind: 'midday', all, remaining }));
    expect(c.body).toMatch(/^Most of today is done/);
    expect(c.title).toMatch(/ is next$/);
  });

  it('evening, overnight: an hour until Fajr, an offer rather than a request', () => {
    const c = reminderCopy(base({ kind: 'evening', overnight: true, beforeNoon: false }));
    expect(c.title).toBe('An hour until Fajr');
    expect(c.body).toMatch(/^If you're up, .* What's left can be added to tomorrow\.$/);
  });

  it('evening, one surah left: names it', () => {
    const remaining = pageRange(tahrim.startPage, tahrim.endPage);
    const c = reminderCopy(base({ kind: 'evening', beforeNoon: false, remaining }));
    expect(c.title).toBe('An hour left today');
    expect(c.body).toBe(`Just ${tahrim.name} left. You're nearly there.`);
  });

  it('congratulation on a juz plan names the juz', () => {
    const juz = pageRange(582, 604);
    const c = reminderCopy(base({ kind: 'congrat', juzPlan: true, all: juz, remaining: [], tomorrow: pageRange(1, 2) }));
    expect(c.title).toBe('Juz 30 is done');
  });

  it('a streak is mentioned only in a congratulation, and only from two days', () => {
    const titles = [0, 1, 2, 3].map((variant) =>
      reminderCopy(base({ kind: 'congrat', remaining: [], streak: 5, variant })).title,
    );
    expect(titles).toContain('5 days in a row');
    const noStreak = [0, 1, 2, 3].map((variant) => reminderCopy(base({ kind: 'congrat', remaining: [], streak: 1, variant })).title);
    expect(noStreak.some((t) => t.includes('days in a row'))).toBe(false);
    expect(reminderCopy(base({ kind: 'morning', streak: 9 })).title).not.toContain('days');
  });

  it('never names a page number or a page count, on any kind, plan or variant', () => {
    const forbidden = /\b(p\.|pages?)\s*\d|\b\d+\s+pages?\b|\bpage\s+\d|\bpages?\s+\d|\b\d+\s+more\b/i;
    const kinds: ReminderKind[] = ['morning', 'midday', 'evening', 'congrat'];
    for (const kind of kinds) {
      for (const juzPlan of [false, true]) {
        for (const overnight of [false, true]) {
          for (let variant = 0; variant < 4; variant++) {
            for (const remaining of [pageRange(mujadila.startPage, tahrim.endPage), pageRange(tahrim.startPage, tahrim.endPage), []]) {
              const c = reminderCopy(base({ kind, juzPlan, overnight, variant, remaining, streak: 4 }));
              const text = `${c.title} ${c.body}`;
              expect(text).not.toMatch(forbidden);
            }
          }
        }
      }
    }
  });
});
