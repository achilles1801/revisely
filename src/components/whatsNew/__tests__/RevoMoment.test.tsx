import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import { RevoMoment } from '../RevoMoment';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DesignProvider } from '../../../design/DesignContext';
import { auth } from '../../../lib/firebase';
import { RevoError, __setRevoBackendForTests, type RevoBackend } from '../../../lib/revo/backend';
import { MOMENT_WORDS } from '../../../lib/whatsNew/revoMoment';
import type { RevoSettings } from '../../../lib/revo/types';

const setOptions = jest.fn(async (_s: Partial<RevoSettings>): Promise<RevoSettings> => ({ optIn: true, memoryOn: true }));
let revoOn = false;
const backend = {
  watchSettings: (_uid: string, cb: (s: RevoSettings) => void) => {
    cb({ optIn: revoOn, memoryOn: true });
    return () => undefined;
  },
  setOptions,
} as unknown as RevoBackend;

async function show({ closable = false } = {}) {
  const onNext = jest.fn();
  const onClose = jest.fn();
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <RevoMoment
          step={4}
          total={5}
          title="Meet Revo"
          text="Ask about your revision, or how anything in the app works."
          firstName="Maryam"
          smartTracking={false}
          closable={closable}
          onNext={onNext}
          onClose={onClose}
        />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
  return { onNext, onClose };
}

const skip = async () => {
  fireEvent.press(screen.getByTestId('whats-new-moment'));
  await act(async () => {});
};

beforeEach(() => {
  revoOn = false;
  setOptions.mockClear();
  __setRevoBackendForTests(backend);
  (auth as { currentUser: unknown }).currentUser = { uid: 'u1' };
});
afterEach(() => {
  __setRevoBackendForTests(null);
  (auth as { currentUser: unknown }).currentUser = null;
  jest.restoreAllMocks();
});

describe('<RevoMoment />', () => {
  it('[NEW-2] a tap takes it to its end: Turn on Revo, or Later, which goes on and writes nothing', async () => {
    const { onNext } = await show();
    // Playing: nothing to choose yet, and the end's buttons take no touch.
    expect(screen.queryByTestId('whats-new-moment-again')).toBeNull();
    fireEvent.press(screen.getByTestId('whats-new-next'));
    expect(onNext).not.toHaveBeenCalled();
    await skip();
    expect(screen.getByTestId('whats-new-title').props.children).toBe('Meet Revo');
    expect(screen.getByTestId('whats-new-title').props.accessibilityLabel).toBe('Step 4 of 5. Meet Revo');
    expect(screen.getByTestId('whats-new-revo-turn-on')).toBeTruthy();
    expect(screen.getByTestId('whats-new-moment-again')).toBeTruthy();
    fireEvent.press(screen.getByTestId('whats-new-next'));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(setOptions).not.toHaveBeenCalled();
  });

  it('[REVO-21] Turn on Revo opens Revo’s own opt-in, which names Anthropic; turning it on goes on', async () => {
    const { onNext } = await show();
    await skip();
    fireEvent.press(screen.getByTestId('whats-new-revo-turn-on'));
    await act(async () => {});
    expect(screen.getByTestId('revo-optin')).toBeTruthy();
    expect(screen.getByText('Answered by Claude, from Anthropic')).toBeTruthy();
    // Smart Tracking off: no weak spots (REVO-36).
    expect(screen.getByText('Coverage, consistency and pace.')).toBeTruthy();
    expect(setOptions).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('revo-turn-on'));
    await act(async () => {});
    expect(setOptions).toHaveBeenCalledWith({ optIn: true });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('[REVO-21] Not now goes back to the end, and nothing is turned on', async () => {
    const { onNext } = await show();
    await skip();
    fireEvent.press(screen.getByTestId('whats-new-revo-turn-on'));
    await act(async () => {});
    fireEvent.press(screen.getByTestId('revo-not-now'));
    await act(async () => {});
    expect(screen.queryByTestId('revo-optin')).toBeNull();
    expect(setOptions).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('a refusal stays on the opt-in and says why', async () => {
    setOptions.mockRejectedValueOnce(new RevoError('offline', 'You’re offline. Revo needs the internet.'));
    const { onNext } = await show();
    await skip();
    fireEvent.press(screen.getByTestId('whats-new-revo-turn-on'));
    await act(async () => {});
    fireEvent.press(screen.getByTestId('revo-turn-on'));
    await act(async () => {});
    expect(screen.getByTestId('revo-optin-error').props.children).toBe('You’re offline. Revo needs the internet.');
    expect(onNext).not.toHaveBeenCalled();
  });

  it('with Revo already on, it ends on Next alone', async () => {
    revoOn = true;
    const { onNext } = await show();
    await skip();
    expect(screen.queryByTestId('whats-new-revo-turn-on')).toBeNull();
    fireEvent.press(screen.getByTestId('whats-new-next'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('VoiceOver gets the end at once, read as one line', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await show();
    expect(screen.getByTestId('whats-new-moment-again')).toBeTruthy();
    expect(screen.getByText('Ask about your revision, or how anything in the app works.').props.accessibilityLabel).toBe(MOMENT_WORDS.summary);
    // The skip control is gone from VoiceOver once there is nothing to skip.
    expect(screen.getByTestId('whats-new-moment', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it('[NEW-3] the replay keeps its ✕', async () => {
    const { onClose } = await show({ closable: true });
    fireEvent.press(screen.getByTestId('whats-new-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows no account’s figures: the pictures are marked Example, Home is a sketch with the first name', async () => {
    await show();
    expect(screen.getByText(MOMENT_WORDS.example, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Maryam', { includeHiddenElements: true })).toBeTruthy();
  });
});
