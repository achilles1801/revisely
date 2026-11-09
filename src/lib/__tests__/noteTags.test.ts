import { parseTag, tagFor } from '../noteTags';

describe('the note tag (C4, d8)', () => {
  it('a tag round-trips', () => {
    expect(parseTag(tagFor('revision', '2026-11-03'))).toEqual({ kind: 'revision', id: '2026-11-03' });
    expect(parseTag(tagFor('read', 'r1'))).toEqual({ kind: 'read', id: 'r1' });
  });
  it('an unknown or empty tag is no tag', () => {
    expect(parseTag(null)).toBeNull();
    expect(parseTag('note:x')).toBeNull();
    expect(parseTag(':x')).toBeNull();
  });
});
