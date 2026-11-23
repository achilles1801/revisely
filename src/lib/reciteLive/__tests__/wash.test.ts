import { followCues, washOf, washReach } from '../wash';

describe('washOf: a highlight as a soft wash, never a box (Majd, Nov 21 2026)', () => {
  const box = { x0: 100, x1: 220, y0: 400, y1: 460 };

  it('a pill-shaped core in the middle of the box, with a soft edge reaching past it on every side', () => {
    const { core, soft } = washOf(box);
    expect(core.y0).toBeGreaterThan(box.y0);
    expect(core.y1).toBeLessThan(box.y1);
    expect(core.x0).toBeGreaterThan(box.x0);
    expect(core.x1).toBeLessThan(box.x1);
    expect((core.x0 + core.x1) / 2).toBeCloseTo((box.x0 + box.x1) / 2);
    expect(soft).toBeGreaterThan(0);
    const reach = washReach(washOf(box));
    // Wider than its word: a box a few units off never shows an edge.
    expect(reach.x0).toBeLessThan(box.x0 - 10);
    expect(reach.x1).toBeGreaterThan(box.x1 + 10);
    expect(reach.y0).toBeLessThan(box.y0);
    expect(reach.y1).toBeGreaterThan(box.y1);
  });

  it('a short word is a round blob, centred on it', () => {
    const short = { x0: 300, x1: 310, y0: 400, y1: 460 };
    const { core } = washOf(short);
    expect(core.x1 - core.x0).toBeCloseTo(core.y1 - core.y0);
    expect((core.x0 + core.x1) / 2).toBeCloseTo(305);
  });

  it('scales with the line: a taller box, a wider soft edge', () => {
    expect(washOf({ ...box, y1: 520 }).soft).toBeGreaterThan(washOf(box).soft);
  });
});

describe('followCues: what follows the reciter (Majd, Nov 21 and 22 2026)', () => {
  it('the page shown: the band behind the cursor’s ayah and the box on the cursor’s word, no word inked', () => {
    expect(followCues(false, 12, 11)).toEqual({ band: 12, box: 12, ink: null });
    expect(followCues(false, null, 11)).toEqual({ band: null, box: null, ink: null });
  });
  it('the page hidden: no band or box, the newest word shown in the following ink', () => {
    expect(followCues(true, 12, 11)).toEqual({ band: null, box: null, ink: 11 });
    expect(followCues(true, 12, null)).toEqual({ band: null, box: null, ink: null });
  });
  it('a newest word with a mark keeps its wash and no following ink', () => {
    expect(followCues(true, 12, 11, (w) => w === 11)).toEqual({ band: null, box: null, ink: null });
    expect(followCues(true, 12, 11, (w) => w === 10)).toEqual({ band: null, box: null, ink: 11 });
  });
});
