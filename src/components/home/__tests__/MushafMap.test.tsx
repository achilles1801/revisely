import { MAP_ROWS } from '../MushafMap';

describe('MushafMap', () => {
  it('lays out every one of the 604 pages once, two juz a row', () => {
    const all = MAP_ROWS.flat(2);
    expect(MAP_ROWS).toHaveLength(15);
    expect(all).toHaveLength(604);
    expect(new Set(all).size).toBe(604);
    expect(Math.min(...all)).toBe(1);
    expect(Math.max(...all)).toBe(604);
  });
});
