import { ayahsOnPage } from '../../ayahKeys';
import { __setMushafEditionForTests } from '../../mushafEdition';
import { memorizationItemsWithWaiting } from '../memorizationItems';
import type { OutboxEntry, OutboxOp } from '../ops';

const entry = (id: string, op: OutboxOp): OutboxEntry => ({ id, op, at: 1 });
const alMulk = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => 67000 + from + i);

beforeAll(() => __setMushafEditionForTests('madani1405'));

describe('the memorization items as this phone sees them (ACT-7)', () => {
  it('[ACT-7] a waiting add joins its day’s item as the server merges it; a waiting delete takes one out', () => {
    const server = [
      { id: '2026-11-01', day: '2026-11-01', pages: [20] },
      { id: '2026-11-02', day: '2026-11-02', pages: [562, 563], verses: alMulk(1, 15) },
    ];
    const out = memorizationItemsWithWaiting(server, [
      // Whole page 564 beside yesterday's ayahs: its ayahs join them.
      entry('a', { kind: 'memorization.mark', day: '2026-11-02', pages: [564], at: 5 }),
      // Today's, not on the server yet.
      entry('b', { kind: 'memorization.mark', day: '2026-11-03', pages: [563], at: 6, verses: alMulk(16, 20) }),
      entry('c', { kind: 'memorization.delete', day: '2026-11-01', id: '2026-11-01' }),
      // An unmark waiting is left out: counting its ayahs as held only keeps more memorized.
      entry('d', { kind: 'memorization.unmark', pages: [562] }),
    ]);
    expect(out).toEqual([
      { id: '2026-11-02', day: '2026-11-02', pages: [562, 563, 564], verses: [...alMulk(1, 15), ...ayahsOnPage(564)] },
      { id: '2026-11-03', day: '2026-11-03', pages: [563], verses: alMulk(16, 20) },
    ]);
  });
});
