import { I18nManager } from 'react-native';
import { backChevron, backIcon, chevron, forwardIcon } from '../direction';
import { HELP_INLINE_ICONS } from '../../lib/help/topics';

describe('chevrons', () => {
  it('point the way the text reads', () => {
    expect(I18nManager.isRTL).toBe(false);
    expect([chevron(), backChevron()]).toEqual(['›', '‹']);
  });

  it('turn round right to left', () => {
    const spy = jest.replaceProperty(I18nManager, 'isRTL', true);
    expect([chevron(), backChevron()]).toEqual(['‹', '›']);
    spy.restore();
  });
});

describe('chevron icons (an icon is a glyph: React Native mirrors rows in RTL, not icons)', () => {
  it('point the way the layout reads', () => {
    expect([forwardIcon(), backIcon()]).toEqual(['chevron-forward', 'chevron-back']);
    expect([HELP_INLINE_ICONS.next, HELP_INLINE_ICONS.back]).toEqual(['chevron-forward', 'chevron-back']);
  });

  it('turn round right to left: "next" points left, back points right, in the help’s icons too', () => {
    const spy = jest.replaceProperty(I18nManager, 'isRTL', true);
    expect([forwardIcon(), backIcon()]).toEqual(['chevron-back', 'chevron-forward']);
    expect([HELP_INLINE_ICONS.next, HELP_INLINE_ICONS.back]).toEqual(['chevron-back', 'chevron-forward']);
    spy.restore();
  });
});
