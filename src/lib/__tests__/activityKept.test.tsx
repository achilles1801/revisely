// What Activity kept from its last reads, per account (ACT-36).
import React from 'react';
import { render } from '@testing-library/react-native';
import { activityKept, keepActivity, keptItemsFrom, resetActivityKeptForTests, useActivityKept, type ActivityItemsData } from '../activityKept';

const data: ActivityItemsData = {
  revisions: [
    { id: 'a', day: '2026-08-01', countsFor: '2026-08-01', pages: [1], skipped: [], assigned: [1], minutes: null, occurredAt: null },
    { id: 'b', day: '2026-11-24', countsFor: '2026-11-24', pages: [2, 3], skipped: [], assigned: [2, 3], minutes: 10, occurredAt: 1 },
  ],
  memorized: [],
  reads: [],
};

beforeEach(() => resetActivityKeptForTests());

it('[ACT-36] the kept copy is there on the first render, for this account only', () => {
  resetActivityKeptForTests({ uid: 'u1', parts: { readings: [], journal: [] } });
  const seen: unknown[] = [];
  function Probe({ uid }: { uid: string }) {
    seen.push(useActivityKept(uid));
    return null;
  }
  render(<Probe uid="u1" />);
  expect(seen[0]).toEqual({ readings: [], journal: [] });
  render(<Probe uid="u2" />);
  expect(seen[1]).toBeNull();
});

it('[ACT-36] the kept items serve a range they reach back to, cut to it; not one they don’t', () => {
  keepActivity('u1', 'items', { from: '2026-07-01', to: '2026-11-24', data });
  const k = activityKept('u1');
  expect(keptItemsFrom(k, '2026-09-01')?.revisions.map((r) => r.id)).toEqual(['b']);
  expect(keptItemsFrom(k, '2026-06-01')).toBeNull();
});
