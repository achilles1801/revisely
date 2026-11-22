// Edit schedule: its settings build the days, and a plan made from them alone, in order, is saved as the automatic
// schedule (SCHED-8, MEM-6; lib/scheduleEditor).

import fc from 'fast-check';
import {
  automaticFields,
  buildDays,
  changeSettings,
  editDays,
  initialDraft,
  savesAsAutomatic,
  ScheduleSettings,
} from '../../../src/lib/scheduleEditor';
import { getPagesScheduledForDate } from '../../../src/lib/algorithm';
import { userWithNewSchedule } from '../../../src/lib/planChange';
import { dayIndexArb, dayFromIndex, memorizedPages, runs, userWith } from './fixtures';

const memorizedArb = fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 1, maxLength: 80 }).map((ps) => [...ps].sort((a, b) => a - b));

describe('Edit schedule’s settings (SCHED-8)', () => {
  it('[SCHED-8] [MEM-6] pages a day in order, from any start: saved as the automatic schedule, today starts there and every memorized page comes round', () => {
    fc.assert(
      fc.property(memorizedArb, fc.integer({ min: 1, max: 30 }), fc.nat(), dayIndexArb, (numbers, perDay, pick, dayIndex) => {
        const revisionDate = dayFromIndex(dayIndex);
        const memorized = memorizedPages(numbers);
        const user = userWith({ dailyPageCapacity: 10, scheduleMode: 'pages', customPlan: null, scheduleAnchorDate: '2025-01-01T00:00:00.000Z' });
        const ctx = { user, memorized, logs: [], revisionDate };
        const startPage = numbers[pick % numbers.length];
        const settings: ScheduleSettings = { by: 'pages', pagesPerDay: Math.min(perDay, numbers.length), juzPerDay: 1, order: 'forward', startPage };
        const days = buildDays(settings, ctx);
        expect(days[0][0]).toBe(startPage);
        expect(new Set(days.flat())).toEqual(new Set(numbers));
        expect(savesAsAutomatic({ settings, edited: false, stale: false })).toBe(true);
        const saved = userWithNewSchedule(user, automaticFields(settings, ctx), { revisionDate, memorized, logs: [], newPlan: true });
        expect(saved.customPlan).toBeNull();
        expect(saved.dailyPageCapacity).toBe(settings.pagesPerDay);
        // Today, as the app will read it, is the editor's first day.
        expect(getPagesScheduledForDate(saved, revisionDate, memorized)).toEqual(days[0]);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[SCHED-8] a day changed by hand makes it a custom plan; a settings change rebuilds it, and back to the settings it opened with restores the schedule', () => {
    fc.assert(
      fc.property(memorizedArb, fc.integer({ min: 1, max: 20 }), dayIndexArb, (numbers, perDay, dayIndex) => {
        const revisionDate = dayFromIndex(dayIndex);
        const memorized = memorizedPages(numbers);
        const user = userWith({ dailyPageCapacity: Math.min(perDay, numbers.length), scheduleMode: 'pages', customPlan: null });
        const ctx = { user, memorized, logs: [], revisionDate };
        const opened = initialDraft(ctx);
        expect(opened.edited).toBe(false);
        const edited = editDays(opened, [...opened.days, []]);
        expect(savesAsAutomatic(edited)).toBe(false);
        const more = { ...edited.settings, pagesPerDay: Math.min(edited.settings.pagesPerDay + 1, numbers.length) };
        if (more.pagesPerDay === edited.settings.pagesPerDay) return;
        const rebuilt = changeSettings(edited, more, ctx, opened, true);
        expect(rebuilt).toMatchObject({ edited: false, rebuilt: true });
        expect(savesAsAutomatic(rebuilt)).toBe(true);
        // REBUILD_OVER_HAND_EDITS off: the days changed by hand stay.
        expect(changeSettings(edited, more, ctx, opened, false)).toMatchObject({ days: edited.days, edited: true, stale: true });
        expect(changeSettings(rebuilt, opened.settings, ctx, opened)).toEqual(opened);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[SCHED-8] where today starts, on days changed by hand, turns the same days to start there', () => {
    fc.assert(
      fc.property(memorizedArb, fc.integer({ min: 1, max: 10 }), fc.nat(), (numbers, perDay, pick) => {
        const revisionDate = dayFromIndex(400);
        const memorized = memorizedPages(numbers);
        const user = userWith({ dailyPageCapacity: Math.min(perDay, numbers.length), scheduleMode: 'pages', customPlan: null });
        const ctx = { user, memorized, logs: [], revisionDate };
        const opened = initialDraft(ctx);
        const edited = editDays(opened, opened.days.map((d) => [...d].reverse()));
        const startPage = numbers[pick % numbers.length];
        // Back to the start it opened with is back to the schedule as it was (the property before).
        if (startPage === opened.settings.startPage) return;
        const turned = changeSettings(edited, { ...edited.settings, startPage }, ctx, opened);
        expect(turned.edited).toBe(true);
        expect([...turned.days].map((d) => d.join()).sort()).toEqual([...edited.days].map((d) => d.join()).sort());
        expect(turned.days[0]).toContain(startPage);
      }),
      { numRuns: runs(200) },
    );
  });
});
