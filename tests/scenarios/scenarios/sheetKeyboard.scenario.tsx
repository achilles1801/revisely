// A sheet with a text field over the keyboard (SHEET-2): it fits above the keyboard and under the
// status bar, so its header (Cancel, Add) stays on screen, and its content shrinks instead (a long
// note scrolls inside its field). Found by a 20-times run of the Note sheet on a CI iOS Simulator
// (Nov 26 2026, run 45757305984): with the note typed again each time, the tenth opening put Cancel
// and Add under the clock (Cancel at y 40–61 of 874), where Maestro's tap never reached the app.
import React from 'react';
import { DeviceEventEmitter, Dimensions, StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';
import fc from 'fast-check';
import { AddNoteSheet } from '../../../src/components/activity/AddNoteSheet';
import { KEYBOARD_TOP_GAP, sheetMaxHeight } from '../../../src/components/v2/Sheet';

const TOP = 62;
const KEYBOARD = 335;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../src/context/ThemeContext', () => {
  const { paletteDark, v2ThemeColors } = require('../../../src/theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(true), isDark: true, palette: paletteDark }) };
});
jest.mock('../../../src/lib/offline/queue', () => ({ queueChange: jest.fn(async () => undefined), currentAccount: () => null }));
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsForDay: jest.fn(async () => ({
    revisions: [{ id: 'rev', day: '2026-11-03', countsFor: '2026-11-03' }],
    memorized: [],
    reads: [],
  })),
}));

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function keyboard(event: 'keyboardWillShow' | 'keyboardWillHide', height: number) {
  const window = Dimensions.get('window');
  act(() => {
    DeviceEventEmitter.emit(event, {
      endCoordinates: { height, screenY: window.height - height, screenX: 0, width: window.width },
      duration: 250,
    });
  });
}

const maxHeightOf = (screen: ReturnType<typeof render>) => StyleSheet.flatten(screen.getByTestId('add-note-sheet').props.style).maxHeight;

describe('a sheet over the keyboard (SHEET-2)', () => {
  it('[SHEET-2] the Note sheet fits above the keyboard and under the status bar, and its note field shrinks to scroll', async () => {
    const window = Dimensions.get('window');
    const screen = render(<AddNoteSheet visible onClose={jest.fn()} day="2026-11-03" />);
    await flush();
    expect(maxHeightOf(screen)).toBe(window.height * 0.9);

    keyboard('keyboardWillShow', KEYBOARD);
    // The sheet's top stays below the status bar: everything it can hold is above the keyboard.
    expect(maxHeightOf(screen)).toBe(window.height - KEYBOARD - TOP - KEYBOARD_TOP_GAP);
    expect(maxHeightOf(screen) + KEYBOARD + TOP).toBeLessThanOrEqual(window.height);
    // A long note scrolls inside its field rather than growing the sheet past that.
    expect(StyleSheet.flatten(screen.getByTestId('add-note-text').props.style).flexShrink).toBe(1);

    keyboard('keyboardWillHide', 0);
    expect(maxHeightOf(screen)).toBe(window.height * 0.9);
  });

  it('[SHEET-2] for any window, keyboard and status bar, a sheet over the keyboard never reaches under the status bar', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 480, max: 1400 }),
        fc.integer({ min: 1, max: 700 }),
        fc.integer({ min: 0, max: 70 }),
        (windowHeight, keyboardHeight, top) => {
          // A keyboard and status bar that leave room at all.
          fc.pre(keyboardHeight + top + KEYBOARD_TOP_GAP <= windowHeight);
          const most = sheetMaxHeight(windowHeight, keyboardHeight, top);
          expect(most).toBeGreaterThanOrEqual(0);
          expect(most).toBeLessThanOrEqual(windowHeight * 0.9);
          expect(most + keyboardHeight + top).toBeLessThanOrEqual(windowHeight);
        },
      ),
    );
    // No keyboard: 90% of the window, as before.
    expect(sheetMaxHeight(874, 0, TOP)).toBe(874 * 0.9);
  });
});
