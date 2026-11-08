import React from 'react';
import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockMark = jest.fn(async (_release: string) => undefined);
const mockApp: { user: { id: string; previewTester?: boolean } | null; markWhatsNewSeen: typeof mockMark } = {
  user: { id: 'u1', previewTester: true },
  markWhatsNewSeen: mockMark,
};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import { WhatsNewScreen } from '../WhatsNewScreen';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DesignProvider } from '../../../design/DesignContext';
import { CURRENT_RELEASE } from '../../../lib/help/whatsNew';
import { loadWhatsNew, resetWhatsNewForTests, setForcedAtLaunch } from '../../../lib/whatsNew/state';

const KEY = '@revisely_whats_new:v1:u1';
const titles = CURRENT_RELEASE.cards.map((c) => c.title);

async function show(mode: 'required' | 'forced' | 'replay', onClose = jest.fn()) {
  await loadWhatsNew('u1');
  const view = render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <WhatsNewScreen mode={mode} onClose={onClose} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
  return { ...view, onClose };
}

const title = () => screen.getByTestId('whats-new-title').props.children;
const next = async () => {
  fireEvent.press(screen.getByTestId('whats-new-next'));
  await act(async () => {});
};

beforeEach(async () => {
  await AsyncStorage.clear();
  resetWhatsNewForTests();
  mockMark.mockClear();
  mockApp.user = { id: 'u1', previewTester: true };
});

describe('<WhatsNewScreen />', () => {
  it('[NEW-2] one Next a card, the step read with the title, Done on the last', async () => {
    await show('required');
    expect(title()).toBe(titles[0]);
    expect(screen.getByTestId('whats-new-title').props.accessibilityLabel).toBe(`Step 1 of ${titles.length}. ${titles[0]}`);
    expect(screen.queryByTestId('whats-new-close')).toBeNull();
    for (let i = 1; i < titles.length; i++) {
      await next();
      expect(title()).toBe(titles[i]);
    }
    expect(screen.queryByTestId('whats-new-next')).toBeNull();
    expect(screen.getByTestId('whats-new-done')).toBeTruthy();
  });

  it('[NEW-2] reopens on the card it was left on', async () => {
    const first = await show('required');
    await next();
    await next();
    expect(title()).toBe(titles[2]);
    first.unmount();
    expect(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}')).toMatchObject({ release: CURRENT_RELEASE.id, card: CURRENT_RELEASE.cards[2].id });
    // A new run of the app: what's on the phone is read again.
    resetWhatsNewForTests();
    await show('required');
    expect(title()).toBe(titles[2]);
  });

  it('[NEW-2] Android’s back goes to the card before; on the first it leaves the app', async () => {
    const handlers: (() => boolean | null | undefined)[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h);
      return { remove: () => undefined };
    });
    await show('required');
    await next();
    expect(title()).toBe(titles[1]);
    await act(async () => {
      expect(handlers[handlers.length - 1]()).toBe(true);
    });
    expect(title()).toBe(titles[0]);
    expect(handlers[handlers.length - 1]()).toBe(false);
    spy.mockRestore();
  });

  it('[NEW-1] Done marks the release seen on the account, and nothing is left to resume', async () => {
    await show('required');
    for (let i = 1; i < titles.length; i++) await next();
    fireEvent.press(screen.getByTestId('whats-new-done'));
    await act(async () => {});
    expect(mockMark).toHaveBeenCalledWith(CURRENT_RELEASE.id);
    expect(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}')).toEqual({});
  });

  it('[NEW-3] a tester’s run at launch writes nothing to the account and turns the switch off', async () => {
    await loadWhatsNew('u1');
    setForcedAtLaunch('u1', true);
    await show('forced');
    for (let i = 1; i < titles.length; i++) await next();
    fireEvent.press(screen.getByTestId('whats-new-done'));
    await act(async () => {});
    expect(mockMark).not.toHaveBeenCalled();
    expect(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}').forced).toBeFalsy();
  });

  it('[NEW-3] the replay closes with ✕ and keeps nothing', async () => {
    const { onClose } = await show('replay');
    await next();
    fireEvent.press(screen.getByTestId('whats-new-close'));
    expect(onClose).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(mockMark).not.toHaveBeenCalled();
  });

  it('[NEW-1] an account without the testers’ features sees only what is already everyone’s', async () => {
    mockApp.user = { id: 'u1', previewTester: false };
    await show('required');
    // Revo is for testers until its switch says everyone; the last card keeps its offline row.
    expect(title()).toBe('Also new');
    expect(screen.getByTestId('whats-new-row-offline')).toBeTruthy();
    expect(screen.queryByTestId('whats-new-row-help')).toBeNull();
    expect(screen.getByTestId('whats-new-done')).toBeTruthy();
  });

  it('reads a row as its words, never a glyph', async () => {
    await show('replay');
    for (let i = 1; i < titles.length; i++) await next();
    expect(screen.getByTestId('whats-new-row-help').props.accessibilityLabel).toBe('Help on screens, Tap ? for a short guide to that screen.');
  });
});
