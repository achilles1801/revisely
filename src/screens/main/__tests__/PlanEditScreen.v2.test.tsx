// The schedule editor in the new design (Home → Today's ⋯ → Edit schedule):
// the v2 top bar, flat sections, the day list's date column, v2 sheets and
// menus, the snackbar.
import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useFrameCallback: () => ({ setActive: jest.fn(), isActive: false, callbackId: -1 }),
}));
require('react-native-gesture-handler/jestSetup');
jest.mock('@expo/vector-icons', () => {
  const { Text: T } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color?: string }) => <T testID={`icon-${name}`} style={{ color }} /> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// Glass, when it shows, is a marker: the new design must have none.
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));

// A gorhom sheet that shows its content once presented, with the frame it was given.
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const RN = require('react-native');
  const BottomSheetModal = React.forwardRef(
    (
      props: {
        children: React.ReactNode;
        backgroundComponent?: React.ComponentType<{ style: object }>;
        backdropComponent?: (p: object) => React.ReactNode;
        handleIndicatorStyle?: object;
        handleStyle?: object;
      },
      ref: React.Ref<unknown>,
    ) => {
      const [open, setOpen] = React.useState(false);
      React.useImperativeHandle(ref, () => ({ present: () => setOpen(true), dismiss: () => setOpen(false) }));
      if (!open) return null;
      const Background = props.backgroundComponent;
      return (
        <RN.View testID="gorhom-sheet">
          {props.backdropComponent?.({ style: undefined, animatedIndex: { value: 0 }, animatedPosition: { value: 0 } })}
          {Background ? <Background style={{}} /> : null}
          <RN.View testID="gorhom-handle" style={[props.handleStyle, props.handleIndicatorStyle]} />
          {props.children}
        </RN.View>
      );
    },
  );
  return {
    BottomSheetModal,
    BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children,
    BottomSheetBackdrop: (p: { style?: object; opacity?: number }) => (
      <RN.View testID="gorhom-backdrop" style={[{ backgroundColor: 'black' }, p.style]} opacity={p.opacity} />
    ),
    BottomSheetView: RN.View,
    BottomSheetScrollView: RN.ScrollView,
    BottomSheetFlatList: RN.FlatList,
    BottomSheetTextInput: RN.TextInput,
  };
});

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
  setParams: jest.fn(),
  dispatch: jest.fn(),
  popTo: jest.fn(),
  addListener: jest.fn(() => () => undefined),
};
const mockRoute: { key: string; params: Record<string, unknown> | undefined } = { key: 'r', params: undefined };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
}));

const mockApp: Record<string, unknown> = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import PlanEditScreen from '../PlanEditScreen';
import PlanDayEditScreen from '../PlanDayEditScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { UndoToast } from '../../../components/revision/UndoToast';
import { DEFAULT_ACCENT, paletteV2, radiusV2, typeV2 } from '../../../theme/v2';
import type { SavedPlan, User, UserPage } from '../../../types';

const palette = paletteV2(false, DEFAULT_ACCENT);
const flat = (style: unknown): Record<string, unknown> => ({ ...(StyleSheet.flatten(style as never) as object) });
const colorOf = (testID: string) => flat(screen.getByTestId(testID).props.style).color;

const baseUser: User = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 3,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  reminderTime: '08:00',
  notificationsEnabled: true,
  currentMemorizationJuz: null,
  currentMemorizationPage: null,
  currentKhatamPage: 1,
  customPlan: null,
  savedPlans: [],
  streak: 0,
  lastRevisionDate: null,
  memorizedSurahs: [],
  fajrBoundaryEnabled: false,
  locationCoords: null,
  fajrCalculationMethod: 'NorthAmerica',
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
};

// Juz 1 and a half (30 pages) at 3 a day: a 10-day cycle, so the list folds at 7.
const memorized: UserPage[] = Array.from({ length: 30 }, (_, i) => ({
  pageNumber: i + 1,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));

const saved: SavedPlan = {
  id: 'p1',
  name: 'Ramadan rotation',
  days: [[1, 2], [3, 4]],
  direction: 'forward',
  createdAt: '2026-10-01T00:00:00Z',
};

function ui(el: React.ReactElement) {
  return (
    <DesignProvider initial={{}}>
      <ThemeProvider>{el}</ThemeProvider>
    </DesignProvider>
  );
}

async function mount(el: React.ReactElement) {
  render(ui(el));
  await act(async () => {});
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockRoute.params = undefined;
  Object.assign(mockApp, {
    user: { ...baseUser, savedPlans: [saved] },
    pages: memorized,
    logs: [],
    saveUser: jest.fn(async () => undefined),
  });
});

describe('the schedule in the new design', () => {
  it('a v2 top bar: back, the title, Save as a solid pill (off until something changes)', async () => {
    await mount(<PlanEditScreen />);
    expect(flat(screen.getByTestId('plan-edit').props.style).backgroundColor).toBe(palette.bg);
    expect(screen.getByRole('header', { name: 'Schedule' })).toBeTruthy();
    expect(flat(screen.getByText('Schedule').props.style)).toMatchObject({ ...typeV2.barTitle, color: palette.text });
    const save = screen.getByTestId('plan-save');
    expect(flat(save.props.style).backgroundColor).toBe(palette.primary);
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('flat: no glass anywhere, sections with bold headers, sentence-case rows', async () => {
    await mount(<PlanEditScreen />);
    for (const header of ['Cycle', 'Saved plans', 'More']) {
      expect(flat(screen.getByText(header).props.style)).toMatchObject({ fontWeight: '600', color: palette.text });
    }
    for (const label of ['Show all 10 days', 'Add rest day', 'Create new plan', 'Save current plan…', 'Running behind?', 'Daily amount']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Create New Plan')).toBeNull();
    // "Show all" is a link; actions read in ink.
    expect(flat(screen.getByText('Show all 10 days').props.style).color).toBe(palette.link);
    expect(flat(screen.getByText('Create new plan').props.style).color).toBe(palette.text);
    // What the plan is.
    expect(within(screen.getByTestId('plan-hero')).getByText('Automatic')).toBeTruthy();
    expect(within(screen.getByTestId('plan-hero')).getByText('Repeats every 10 days')).toBeTruthy();
  });

  it('the days: the date column in sentence case, today in the accent, content as a feed row', async () => {
    await mount(<PlanEditScreen />);
    expect(screen.getByTestId('day-item-6')).toBeTruthy();
    expect(screen.queryByTestId('day-item-7')).toBeNull();
    const today = within(screen.getByTestId('date-badge-0')).getByText('Today');
    expect(flat(today.props.style).color).toBe(palette.accentText);
    expect(screen.queryByText('TODAY')).toBeNull();
    expect(flat(screen.getByTestId('day-title-0').props.style)).toMatchObject({ ...typeV2.name, color: palette.text });
    // The drop target and the hairlines in tokens.
    expect(flat(screen.getByTestId('day-target-0').props.style).backgroundColor).toBe(palette.accentSubtle);
    expect(flat(screen.getByTestId('day-separator-0').props.style)).toMatchObject({
      backgroundColor: palette.separator,
      height: 0.5,
    });
    // Lifted: on the quiet fill with an edge, no shadow.
    const lifted = flat(screen.getByTestId('day-lifted-0').props.style);
    expect(lifted).toMatchObject({ backgroundColor: palette.fill, borderColor: palette.handle, borderRadius: radiusV2.media });
    expect(lifted.shadowOpacity).toBeUndefined();
    // Delete on the destructive fill.
    expect(flat(screen.getByTestId('day-delete-fill-0').props.style).backgroundColor).toBe(palette.redFill);
    expect(flat(within(screen.getByTestId('day-delete-0')).getByText('Delete').props.style).color).toBe(palette.onRedFill);

    fireEvent.press(screen.getByTestId('plan-show-all'));
    expect(screen.getByTestId('day-item-9')).toBeTruthy();
  });

  it('an edit shows "Unsaved changes" in the accent and turns Save on; saving buzzes once', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-add-day'));
    expect(colorOf('plan-dirty')).toBe(palette.accentText);
    expect(within(screen.getByTestId('plan-hero')).getByText('Custom plan')).toBeTruthy();
    expect(screen.getByTestId('plan-save').props.accessibilityState).toMatchObject({ disabled: false });
    // Taps don't buzz.
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('plan-save'));
    });
    expect(mockApp.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({ customPlan: expect.objectContaining({ days: expect.any(Array) }) }),
    );
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('deleting a day shows the snackbar: ink ground, Undo puts the day back', async () => {
    await mount(<PlanEditScreen />);
    const before = screen.getByTestId('day-item-1').props.accessibilityLabel;
    fireEvent(screen.getByTestId('day-item-1'), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    await act(async () => {});
    const toast = screen.getByTestId('undo-toast');
    expect(within(toast).getByText(/deleted$/)).toBeTruthy();
    const bar = flat(screen.getByTestId('undo-toast-bar').props.style);
    expect(bar.backgroundColor).toBe(palette.text);
    expect(bar.shadowOpacity).toBeUndefined();
    expect(flat(within(toast).getByText(/deleted$/).props.style).color).toBe(palette.bg);
    fireEvent.press(screen.getByTestId('undo-toast-action'));
    await act(async () => {});
    expect(screen.queryByTestId('undo-toast')).toBeNull();
    expect(screen.getByTestId('day-item-1').props.accessibilityLabel).toBe(before);
  });

  it('Daily amount: a v2 sheet (solid, 20pt corners, v2 handle and backdrop), pill tabs, a quiet stepper', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-quota'));
    const sheet = screen.getByTestId('gorhom-sheet');
    expect(flat(within(sheet).getByTestId('plan-sheet-background').props.style)).toMatchObject({
      backgroundColor: palette.sheet,
      borderTopLeftRadius: radiusV2.sheet,
    });
    expect(flat(within(sheet).getByTestId('gorhom-handle').props.style).backgroundColor).toBe(palette.handle);
    const backdrop = within(sheet).getByTestId('gorhom-backdrop');
    expect(flat(backdrop.props.style).backgroundColor).toBe(palette.overlay);
    expect(backdrop.props.opacity).toBe(1);
    expect(flat(within(sheet).getByText('Daily amount').props.style)).toMatchObject({ ...typeV2.sheetTitle, color: palette.text });
    expect(flat(within(sheet).getByText('Save').props.style)).toMatchObject({ fontWeight: '600', color: palette.text });
    expect(flat(within(sheet).getByTestId('pill-pages').props.style).backgroundColor).toBe(palette.primary);

    fireEvent.press(within(sheet).getByLabelText('Increase pages per day'));
    expect(within(sheet).getByText('4')).toBeTruthy();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    fireEvent.press(within(sheet).getByTestId('pill-juz'));
    expect(within(sheet).getByText('Ajzaʼ per day')).toBeTruthy();
  });

  it('Running behind? is a v2 menu with the two shifts', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-timing'));
    await act(async () => {});
    const menu = screen.getByTestId('plan-timing-menu');
    expect(within(menu).getByText('Push back a day')).toBeTruthy();
    expect(within(menu).getByText('Skip ahead a day')).toBeTruthy();
    expect(within(menu).getByTestId('sheet-cancel')).toBeTruthy();
  });

  it('a saved plan opens a v2 menu: Load plan replaces the days, Delete plan in red', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('saved-plan-p1'));
    await act(async () => {});
    const menu = screen.getByTestId('saved-plan-menu');
    expect(within(menu).getByText('Ramadan rotation')).toBeTruthy();
    expect(flat(within(menu).getByText('Delete plan').props.style).color).toBe(palette.red);
    fireEvent.press(within(menu).getByTestId('sheet-action-load'));
    // The action runs once the menu has gone (iOS: the modal's dismissal).
    const modal = screen.UNSAFE_getAllByType(Modal).find((m) => m.props.visible);
    await act(async () => {
      modal?.props.onDismiss?.();
    });
    expect(within(screen.getByTestId('plan-hero')).getByText('Repeats every 2 days')).toBeTruthy();
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
  });

  it('the plan builder: pill tabs for the kind, the preview days on hairlines with their dates', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-create'));
    const sheet = screen.getByTestId('gorhom-sheet');
    expect(within(sheet).getByText('New plan')).toBeTruthy();
    expect(flat(within(sheet).getByTestId('pill-balanced').props.style).backgroundColor).toBe(palette.primary);
    expect(within(sheet).getByTestId('day-row-0')).toBeTruthy();
    expect(flat(within(within(sheet).getByTestId('date-badge-0')).getByText('Today').props.style).color).toBe(
      palette.accentText,
    );
  });
});

describe('a day in the new design', () => {
  beforeEach(() => {
    mockRoute.params = { dayIndex: 0, initialPages: [1, 2, 3] };
  });

  it('a v2 top bar back to the schedule, what is on the day as the title, flat rows', async () => {
    await mount(<PlanDayEditScreen />);
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(flat(screen.getByRole('header', { name: 'Juz 1' }).props.style)).toMatchObject({ ...typeV2.title, color: palette.text });
    expect(screen.getByText('Add or remove content')).toBeTruthy();
    expect(flat(screen.getByText('Make rest day').props.style).color).toBe(palette.red);
    // Edit is a link; editing shows red remove buttons.
    expect(flat(screen.getByText('Edit').props.style).color).toBe(palette.link);
    fireEvent.press(screen.getByLabelText('Edit'));
    expect(screen.getByTestId('remove-surah-1')).toBeTruthy();
    expect(flat(within(screen.getByTestId('remove-surah-1')).getByTestId('icon-remove-circle-outline').props.style).color).toBe(
      palette.red,
    );
    fireEvent.press(screen.getByLabelText('Back to schedule'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('the picker: search on the quiet fill, pill tabs, rows checked in ink', async () => {
    await mount(<PlanDayEditScreen />);
    fireEvent.press(screen.getByTestId('day-pick'));
    const sheet = screen.getByTestId('gorhom-sheet');
    expect(within(sheet).getByText("Today's revision")).toBeTruthy();
    expect(flat(within(sheet).getByTestId('picker-search-field').props.style).backgroundColor).toBe(palette.fill);
    expect(within(sheet).getByTestId('picker-search').props.placeholderTextColor).toBe(palette.secondary);
    expect(within(sheet).getByTestId('picker-tabs')).toBeTruthy();
    expect(flat(within(sheet).getByTestId('pill-surah').props.style).backgroundColor).toBe(palette.primary);
    // Al-Fatiha is wholly on the day: checked, in ink and semibold. A tap unchecks it.
    const fatiha = () => within(screen.getByTestId('gorhom-sheet')).getByTestId('picker-item-surah:1');
    expect(flat(within(fatiha()).getByTestId('icon-checkmark').props.style).color).toBe(palette.text);
    expect(flat(within(fatiha()).getByText('Al-Fatihah').props.style)).toMatchObject({ fontWeight: '600', color: palette.text });
    fireEvent.press(fatiha());
    expect(within(fatiha()).queryByTestId('icon-checkmark')).toBeNull();
  });
});

describe('the snackbar elsewhere (reader, session)', () => {
  it('is the same ink bar in the new design', async () => {
    render(ui(<UndoToast visible message="Pages cleared" onUndo={jest.fn()} onDismiss={jest.fn()} />));
    await act(async () => {});
    expect(flat(screen.getByTestId('undo-toast-bar').props.style)).toMatchObject({
      backgroundColor: palette.text,
      borderRadius: radiusV2.media,
    });
    expect(flat(screen.getByText('Pages cleared').props.style).color).toBe(palette.bg);
  });
});
