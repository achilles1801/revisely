jest.mock('@react-native-firebase/app', () => ({ __esModule: true, default: {} }));
jest.mock('@react-native-firebase/app-check', () => ({}));

import { debugTokenFor } from '../appCheck';

describe('App Check debug token', () => {
  it('only in development builds, and only when one is set locally', () => {
    expect(debugTokenFor(true, ' 0B1C2D3E-4F50-6172-8394-A5B6C7D8E9F0 ')).toBe('0B1C2D3E-4F50-6172-8394-A5B6C7D8E9F0');
    expect(debugTokenFor(false, '0B1C2D3E-4F50-6172-8394-A5B6C7D8E9F0')).toBeUndefined();
    expect(debugTokenFor(true, '')).toBeUndefined();
    expect(debugTokenFor(true, undefined)).toBeUndefined();
  });
});
