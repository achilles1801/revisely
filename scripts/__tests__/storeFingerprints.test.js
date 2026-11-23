// scripts/check-store-fingerprints.js: CI's guard against moving the store app's runtime by accident. The fingerprints
// themselves are computed in CI (Fast checks); this checks the comparison and the committed file.
const { moved, PLATFORMS } = require('../check-store-fingerprints');
const expected = require('../store-fingerprints.json');

describe('store fingerprints', () => {
  it('names only the platforms whose fingerprint differs', () => {
    const base = { ios: 'a'.repeat(40), android: 'b'.repeat(40) };
    expect(moved(base, { ...base })).toEqual([]);
    expect(moved(base, { ...base, ios: 'c'.repeat(40) })).toEqual(['ios']);
    expect(moved(base, { ios: 'c'.repeat(40), android: 'd'.repeat(40) })).toEqual(['ios', 'android']);
  });

  it('keeps a full hash for each platform', () => {
    for (const p of PLATFORMS) expect(expected[p]).toMatch(/^[0-9a-f]{40}$/);
  });
});
