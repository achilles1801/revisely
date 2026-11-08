// The help buttons are on by default (HELP-4): who has help, and what an unset or unreadable setting means.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { HELP_FOR_EVERYONE, helpAvailable } from '../availability';
import { useHelpHidden } from '../state';

describe('who has help', () => {
  it('testers until the release; every account once the release switches it on', () => {
    expect(helpAvailable({ previewTester: true })).toBe(true);
    expect(helpAvailable({ previewTester: false })).toBe(HELP_FOR_EVERYONE);
    expect(helpAvailable({ previewTester: false }, true)).toBe(true);
    expect(helpAvailable({}, true)).toBe(true);
    expect(helpAvailable(null, true)).toBe(false);
  });
});

describe('the ? is on unless the user hid it', () => {
  beforeEach(() => AsyncStorage.clear());

  it('nothing stored: shown', async () => {
    const { result } = renderHook(() => useHelpHidden('fresh-account'));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('a setting that can’t be read, or isn’t a hide: shown', async () => {
    await AsyncStorage.setItem('@revisely_help:v1:garbled', '{not json');
    await AsyncStorage.setItem('@revisely_help:v1:other', JSON.stringify({ hidden: 'yes' }));
    const a = renderHook(() => useHelpHidden('garbled'));
    const b = renderHook(() => useHelpHidden('other'));
    await waitFor(() => expect(a.result.current).toBe(false));
    await waitFor(() => expect(b.result.current).toBe(false));
  });

  it('only a hide the user chose takes it away', async () => {
    await AsyncStorage.setItem('@revisely_help:v1:chose', JSON.stringify({ hidden: true }));
    const { result } = renderHook(() => useHelpHidden('chose'));
    await waitFor(() => expect(result.current).toBe(true));
  });
});
