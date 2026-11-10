import { revisionItemsFor, revisionItemId } from '../revisionItems';
import type { FirestoreSession } from '../../types/firestore';

const DAY = '2026-11-04';
const UID = 'u1';

function session(extra: Partial<FirestoreSession> = {}): FirestoreSession {
  return {
    id: DAY,
    date: DAY,
    state: 'IN_PROGRESS',
    createdAt: { toMillis: () => 1793800000000 } as unknown as FirestoreSession['createdAt'],
    updatedAt: {} as FirestoreSession['updatedAt'],
    completedAt: null,
    durationMinutes: 12.4,
    assignedPages: [549, 550, 551, 552],
    totalAssignedPages: 4,
    pagesRevised: [549, 550, 551],
    pagesSkipped: [552],
    weaknessUpdates: [],
    completionPercentage: 75,
    ...extra,
  } as FirestoreSession;
}

describe('revisionItemsFor', () => {
  it('writes one item for the day, keyed by the session id', () => {
    const [own] = revisionItemsFor(session(), UID);
    expect(own).toEqual({
      id: DAY,
      uid: UID,
      day: DAY,
      occurredAt: 1793800000000,
      countsFor: DAY,
      source: 'session',
      pages: [549, 550, 551],
      skipped: [552],
      assigned: [549, 550, 551, 552],
      minutes: 12,
      recordings: [],
    });
  });

  it('writes no item for the day when nothing was revised', () => {
    expect(revisionItemsFor(session({ pagesRevised: [] }), UID)).toEqual([]);
  });

  it('rounds and caps minutes to a day', () => {
    expect(revisionItemsFor(session({ durationMinutes: 2000 }), UID)[0].minutes).toBe(1440);
    expect(revisionItemsFor(session({ durationMinutes: null }), UID)[0].minutes).toBeNull();
  });

  it('moves pages revised ahead out of the day and into an item counted for the later day', () => {
    const items = revisionItemsFor(
      session({ pagesRevised: [549, 550, 553], ahead: { '2026-11-06': [553] } }),
      UID,
    );
    expect(items).toHaveLength(2);
    expect(items[0].pages).toEqual([549, 550]);
    expect(items[1]).toMatchObject({
      id: `${DAY}-ahead-2026-11-06`,
      day: DAY,
      countsFor: '2026-11-06',
      pages: [553],
      minutes: null,
    });
  });

  // AHEAD-3: past the cycle's end, a new round revises the day's own pages again for a day a cycle on.
  it('keeps the day’s own pages in its item when a new round revised them again for a later day', () => {
    const items = revisionItemsFor(
      session({ pagesRevised: [549, 550, 551, 552], ahead: { '2026-11-11': [549, 550] } }),
      UID,
    );
    expect(items[0].pages).toEqual([549, 550, 551, 552]);
    expect(items[1]).toMatchObject({ countsFor: '2026-11-11', pages: [549, 550] });
  });

  it('gives ratings from the session weakness changes', () => {
    const [own] = revisionItemsFor(
      session({ weaknessUpdates: [{ pageNumber: 550, previousRating: 3, newRating: 2, changedAt: {} as never }] }),
      UID,
    );
    expect(own.ratings).toEqual({ '550': 2 });
  });

  it('writes the same items for the same session, so a replay changes nothing', () => {
    expect(revisionItemsFor(session(), UID)).toEqual(revisionItemsFor(session(), UID));
  });
});

describe('revisionItemId', () => {
  it('is the day for the day itself and suffixed for a credit', () => {
    expect(revisionItemId(DAY)).toBe(DAY);
    expect(revisionItemId(DAY, DAY)).toBe(DAY);
    expect(revisionItemId(DAY, '2026-11-06')).toBe(`${DAY}-ahead-2026-11-06`);
  });
});
