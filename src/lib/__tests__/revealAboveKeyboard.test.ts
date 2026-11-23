import { revealAboveKeyboard } from '../revealAboveKeyboard';

// The daily log's composer on an iPhone SE (Nov 16 2026): the list from y 68, the keyboard from 405.
describe('revealAboveKeyboard', () => {
  const se = { offset: 0, listTop: 68, keyboardTop: 405 };

  it('moves the list up by what the keyboard covers of the buttons, and a margin', () => {
    // Save 402–432 while a note is edited: 39 points up.
    expect(revealAboveKeyboard({ ...se, targetBottom: 432, blockTop: 216 })).toBe(39);
    expect(revealAboveKeyboard({ ...se, offset: 120, targetBottom: 432, blockTop: 216 })).toBe(159);
  });

  it('moves nothing when the buttons already show above the keyboard', () => {
    expect(revealAboveKeyboard({ ...se, targetBottom: 380, blockTop: 216 })).toBeNull();
    expect(revealAboveKeyboard({ ...se, targetBottom: 393, blockTop: 216 })).toBeNull();
  });

  it("never pushes the block's top past the list's top: the field being typed in stays", () => {
    // A long note: the buttons are far under the keyboard, the composer starts 30 points below the list's top.
    expect(revealAboveKeyboard({ ...se, targetBottom: 700, blockTop: 98 })).toBe(30);
    // Already at the top: nothing moves (Done puts the keyboard away).
    expect(revealAboveKeyboard({ ...se, targetBottom: 700, blockTop: 68 })).toBeNull();
    expect(revealAboveKeyboard({ ...se, targetBottom: 700, blockTop: 40 })).toBeNull();
  });
});
