// A session of a day Keep daily amount filled with carried pages (SESS-7, D1: Majd, Nov 7 2026):
// its pages are credited to the days they were missed, and they are still what the day revised.
import { ownRevised, revisionItem } from '../activityItems';
import type { RevisionLog } from '../../types';

const log = (extra: Partial<RevisionLog>): RevisionLog => ({
  id: '2026-11-05',
  date: '2026-11-05',
  pagesRevised: [],
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: 12,
  ...extra,
});

describe('[SESS-7] a session of a day filled with carried pages', () => {
  it('says it revised them, not "0 of 6"', () => {
    const filled = log({ assignedPages: [583, 584, 585, 586, 587, 588], ahead: { '2026-11-03': [583, 584, 585], '2026-11-04': [586, 587, 588] } });
    const item = revisionItem(filled);
    expect(item.title).toBe('Revised 6 pages');
    expect(item.done).toBe(true);
    expect(ownRevised(filled)).toEqual([583, 584, 585, 586, 587, 588]);
    // Half of them: "3 of 6", not done.
    const half = log({ assignedPages: [583, 584, 585, 586, 587, 588], ahead: { '2026-11-03': [583, 584, 585] } });
    expect(revisionItem(half).title).toBe('Revised 3 of 6 pages');
    expect(revisionItem(half).done).toBe(false);
  });

  it('a day with pages of its own still counts only those (the carried pages count for their days)', () => {
    const partial = log({ assignedPages: [587, 588, 589], pagesRevised: [587, 588, 589], ahead: { '2026-11-04': [585, 586] } });
    expect(revisionItem(partial).title).toBe('Revised 3 pages');
    expect(ownRevised(partial)).toEqual([587, 588, 589]);
  });
});
