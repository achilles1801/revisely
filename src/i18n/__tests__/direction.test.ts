import { I18nManager } from 'react-native';
import { backChevron, chevron } from '../direction';

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
