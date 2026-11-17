// Activity's sections (ACT-29): whatever this phone holds for the layout, and whatever moves and switches the user
// makes, each tab still has every one of its sections exactly once, the calendar is never hidden, and what was
// stored comes back as it was saved.
import fc from 'fast-check';
import {
  DEFAULT_SECTIONS,
  REQUIRED_SECTIONS,
  TAB_SECTIONS,
  cleanLayout,
  cleanTab,
  isDefaultTab,
  moveSection,
  sectionsToShow,
  setSectionShown,
  type ActivityTab,
  type TabLayout,
} from '../../../src/lib/activitySections';

const TABS: ActivityTab[] = ['overview', 'insights'];
const ANY_ID = fc.constantFrom(...TAB_SECTIONS.overview, ...TAB_SECTIONS.insights, 'calendarr', '', 'pace ', 'toString');
// What a phone might hold: anything at all, or something shaped like a layout with odd ids, repeats and gaps.
const STORED = fc.oneof(
  fc.anything(),
  fc.record({ order: fc.array(fc.oneof(ANY_ID, fc.anything()), { maxLength: 12 }), hidden: fc.array(fc.oneof(ANY_ID, fc.anything()), { maxLength: 12 }) }, { requiredKeys: [] }),
);

function wellFormed(tab: ActivityTab, l: TabLayout) {
  const all = TAB_SECTIONS[tab] as readonly string[];
  expect([...l.order].sort()).toEqual([...all].sort());
  expect(new Set(l.hidden).size).toBe(l.hidden.length);
  for (const id of l.hidden) expect(all).toContain(id);
  for (const id of REQUIRED_SECTIONS[tab]) expect(l.hidden).not.toContain(id);
}

describe('Activity’s sections, any layout', () => {
  it('[ACT-29] whatever is stored, each tab has every section once, and the calendar is never hidden', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TABS), STORED, (tab, raw) => {
        const l = cleanTab(tab, raw);
        wellFormed(tab, l);
        // Cleaning a clean layout changes nothing, and it survives the trip through storage.
        expect(cleanTab(tab, l)).toEqual(l);
        expect(cleanLayout(JSON.parse(JSON.stringify({ [tab]: l })))[tab]).toEqual(l);
      }),
    );
  });

  it('[ACT-29] moves and switches keep the layout whole; a moved section lands where it was put', () => {
    const step = fc.oneof(
      fc.record({ kind: fc.constant('move' as const), from: fc.integer({ min: -2, max: 8 }), to: fc.integer({ min: -2, max: 8 }) }),
      fc.record({ kind: fc.constant('show' as const), at: fc.nat(7), shown: fc.boolean() }),
    );
    fc.assert(
      fc.property(fc.constantFrom(...TABS), STORED, fc.array(step, { maxLength: 20 }), (tab, raw, steps) => {
        let l = cleanTab(tab, raw);
        for (const s of steps) {
          if (s.kind === 'move') {
            const before = l;
            l = cleanTab(tab, moveSection(l, s.from, s.to));
            if (s.from >= 0 && s.from < before.order.length) {
              const to = Math.max(0, Math.min(before.order.length - 1, s.to));
              expect(l.order[to]).toBe(before.order[s.from]);
            } else expect(l).toEqual(before);
          } else {
            const id = l.order[s.at % l.order.length];
            l = cleanTab(tab, setSectionShown(tab, l, id, s.shown));
            const required = (REQUIRED_SECTIONS[tab] as readonly string[]).includes(id);
            expect(l.hidden.includes(id)).toBe(!s.shown && !required);
          }
          wellFormed(tab, l);
          // What is drawn: the order, less what is hidden and what the account can't have.
          const cant = l.order[0];
          expect(sectionsToShow(l, (id) => id !== cant)).toEqual(l.order.filter((id) => id !== cant && !l.hidden.includes(id)));
        }
      }),
    );
  });

  it('[ACT-29] a section the stored order lacks (one added since) comes back after the one it follows in the usual order', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TABS), fc.nat(5), (tab, k) => {
        const all = [...TAB_SECTIONS[tab]];
        const missing = all[k % all.length];
        const stored = all.filter((id) => id !== missing).reverse();
        const l = cleanTab(tab, { order: stored, hidden: [] });
        const at = all.indexOf(missing);
        if (at === 0) expect(l.order[0]).toBe(missing);
        else expect(l.order[l.order.indexOf(all[at - 1]) + 1]).toBe(missing);
      }),
    );
    for (const tab of TABS) {
      expect(cleanTab(tab, null)).toEqual(DEFAULT_SECTIONS[tab]);
      expect(isDefaultTab(tab, cleanTab(tab, undefined))).toBe(true);
    }
  });
});
