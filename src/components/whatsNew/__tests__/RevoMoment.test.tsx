import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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
  fireEvent.press(screen.getByTestId('whats-new-moment-skip'));
  await act(async () => {});
};

beforeEach(() => {
  // VoiceOver off unless a test turns it on (its mock outlives restoreAllMocks).
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
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
  it('[NEW-2] Skip takes it to its end: Turn on Revo, or Later, which goes on and writes nothing', async () => {
    const { onNext } = await show();
    // Playing: nothing to choose yet, and the end's buttons take no touch.
    expect(screen.getByTestId('whats-new-moment-skip')).toBeTruthy();
    fireEvent.press(screen.getByTestId('whats-new-next'));
    expect(onNext).not.toHaveBeenCalled();
    await skip();
    expect(screen.getByTestId('whats-new-title').props.children).toBe('Meet Revo');
    expect(screen.getByTestId('whats-new-title').props.accessibilityLabel).toBe('Step 4 of 5. Meet Revo');
    expect(screen.getByTestId('whats-new-revo-turn-on')).toBeTruthy();
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
    expect(screen.getByTestId('whats-new-revo-turn-on')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('whats-new-moment-again')).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByText('Ask about your revision, or how anything in the app works.').props.accessibilityLabel).toBe(MOMENT_WORDS.summary);
    // Nothing to skip.
    expect(screen.queryByTestId('whats-new-moment-skip')).toBeNull();
  });

  it('[NEW-2] while it plays only Skip ends it: a touch anywhere else does nothing', async () => {
    const { onNext } = await show();
    // No tap-anywhere control: the screen itself takes no press.
    expect(screen.queryByTestId('whats-new-moment')).toBeNull();
    fireEvent.press(screen.getByTestId('whats-new-revo-moment'));
    fireEvent.press(screen.getByTestId('whats-new-title'));
    await act(async () => {});
    // Still playing: Skip is still there.
    expect(screen.getByTestId('whats-new-moment-skip')).toBeTruthy();
    expect(onNext).not.toHaveBeenCalled();
    // Skip: a visible button in the top corner, a 44pt target, read as "Skip".
    const button = screen.getByTestId('whats-new-moment-skip');
    expect(button.props.accessibilityLabel).toBe('Skip');
    expect(button.props.accessibilityRole).toBe('button');
    expect(screen.getByText('Skip')).toBeTruthy();
    const box = StyleSheet.flatten(button.props.style) as { height?: number; minWidth?: number };
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.minWidth).toBeGreaterThanOrEqual(44);
    await skip();
    expect(screen.queryByTestId('whats-new-moment-skip')).toBeNull();
  });

  it('[NEW-2] a second tap where Skip was does nothing: Watch again takes its place a moment later', async () => {
    await show();
    await skip();
    // Right after Skip, the corner is empty, so a double tap can't start it over.
    expect(screen.queryByTestId('whats-new-moment-skip')).toBeNull();
    expect(screen.queryByTestId('whats-new-moment-again')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('whats-new-moment-again')).toBeTruthy(), { timeout: 2000 });
    // Watch again plays it from the start: Skip is back.
    fireEvent.press(screen.getByTestId('whats-new-moment-again'));
    await act(async () => {});
    expect(screen.getByTestId('whats-new-moment-skip')).toBeTruthy();
    expect(screen.queryByTestId('whats-new-moment-again')).toBeNull();
  });

  it('lands Revo where its button is on this screen, measured, not the window (Android’s is shorter)', async () => {
    await show();
    fireEvent(screen.getByTestId('whats-new-revo-moment'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 412, height: 915 } } });
    await act(async () => {});
    const docked = StyleSheet.flatten(screen.getByTestId('whats-new-moment-docked', { includeHiddenElements: true }).props.style) as { left: number; top: number };
    // The tab bar (52 + 14 with no home indicator), the button's gap (14), its size (44); 16 from the right.
    expect(docked.top).toBe(915 - 66 - 14 - 44);
    expect(docked.left).toBe(412 - 16 - 44);
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
