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

describe('the schedule’s help (HELP-1, HELP-3)', () => {
  it('a ? before Save; its sheet explains the cycle, and with Smart Tracking off a new plan has no weakest first', async () => {
    Object.assign(mockApp, { user: { ...baseUser, smartTrackingEnabled: false } });
    await mount(<PlanEditScreen />);
    fireEvent.press(await screen.findByTestId('help-button-schedule'));
    expect(await screen.findByTestId('help-sheet-schedule')).toBeTruthy();
    expect(screen.getByText('How the schedule works')).toBeTruthy();
    expect(screen.getByTestId('help-topic-schedule.cycle')).toBeTruthy();
    expect(screen.getByTestId('help-topic-schedule.new.off')).toBeTruthy();
    expect(screen.queryByTestId('help-topic-schedule.new')).toBeNull();
    expect(screen.queryByText(/weakest/i)).toBeNull();
  });

  it('with Smart Tracking on, a new plan can put the weakest pages first', async () => {
    Object.assign(mockApp, { user: { ...baseUser, smartTrackingEnabled: true } });
    await mount(<PlanEditScreen />);
    fireEvent.press(await screen.findByTestId('help-button-schedule'));
    expect(await screen.findByTestId('help-topic-schedule.new')).toBeTruthy();
    expect(screen.queryByTestId('help-topic-schedule.new.off')).toBeNull();
  });

  it('[HELP-4] an account that isn’t a tester has the ? too, and so does a tester', async () => {
    for (const user of [baseUser, { ...baseUser, previewTester: false }, { ...baseUser, previewTester: true }]) {
      Object.assign(mockApp, { user });
      await mount(<PlanEditScreen />);
      await act(async () => {});
      expect(screen.getByTestId('help-button-schedule')).toBeTruthy();
      screen.unmount();
    }
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
    for (const label of ['Show all 10 days', 'Add rest day', 'Create new plan', 'Save current plan…', 'Daily amount']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Running behind? (push back / skip ahead a day) is gone: Home's Jump to… moves where today starts.
    expect(screen.queryByText('Running behind?')).toBeNull();
    expect(screen.queryByTestId('plan-timing')).toBeNull();
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

  it('[ACT-24] from “Add to plan”: the pages added to the day are an edit, saying it is every cycle; back hands them to the plan', async () => {
    mockRoute.params = { dayIndex: 1, initialPages: [1, 2, 3, 4], basePages: [1, 2], note: 'Saving the plan adds Al-Baqarah 1–16 to this day in every cycle.' };
    await mount(<PlanDayEditScreen />);
    expect(screen.getByTestId('plan-day-note').props.children).toMatch(/every cycle\.$/);
    expect(screen.getByText(/Edited$/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Back to schedule'));
    // Into the plan's draft, which is saved from the plan (nothing is saved here).
    expect(mockNavigation.popTo).toHaveBeenCalledWith('PlanEdit', { editedDay: { index: 1, pages: [1, 2, 3, 4] } }, { merge: true });
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
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

// Saving a new plan and today's revision (the 1.0.2 report: "I created a new plan
// and loaded it but it didn't update my revision for today").
describe('a new plan and today', () => {
  const { applyCarryOver } = require('../../../lib/carryOver');
  const { generateDailyAssignment } = require('../../../lib/algorithm');
  const { dateToLocalISODay } = require('../../../lib/schedulePlans');
  const { Alert } = require('react-native');
  const revisionDate = new Date();
  revisionDate.setHours(0, 0, 0, 0);
  const TODAY = dateToLocalISODay(revisionDate);
  const tomorrow = new Date(revisionDate.getFullYear(), revisionDate.getMonth(), revisionDate.getDate() + 1);
  const yesterday = new Date(revisionDate.getFullYear(), revisionDate.getMonth(), revisionDate.getDate() - 1);
  const todayOf = (u: User, date = revisionDate) => generateDailyAssignment(memorized, [], u, date).pages;
  const sessionLog = (date: string, assignedPages: number[], pagesRevised: number[]) => ({
    id: date,
    date,
    assignedPages,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 5,
  });
  // Yesterday's pages 28 and 29 weren't finished and were added to today.
  const withLeftovers = (): User =>
    applyCarryOver({ ...baseUser, savedPlans: [saved] }, memorized, [28, 29], revisionDate);

  async function loadSavedPlanAndSave() {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('saved-plan-p1'));
    await act(async () => {});
    fireEvent.press(within(screen.getByTestId('saved-plan-menu')).getByTestId('sheet-action-load'));
    await act(async () => {
      screen.UNSAFE_getAllByType(Modal).find((m) => m.props.visible)?.props.onDismiss?.();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('plan-save'));
    });
  }
  const savedUser = (): User => (mockApp.saveUser as jest.Mock).mock.calls.at(-1)[0];

  it('nothing revised today: today becomes the plan’s first day, without yesterday’s leftovers on top', async () => {
    mockApp.user = withLeftovers();
    expect(todayOf(mockApp.user as User).slice(0, 2)).toEqual([28, 29]);
    mockApp.logs = [sessionLog(dateToLocalISODay(yesterday), [28, 29, 30], [30])];
    await loadSavedPlanAndSave();
    expect(todayOf(savedUser())).toEqual([1, 2]);
    expect(todayOf(savedUser(), tomorrow)).toEqual([3, 4]);
  });

  it('part of today revised: no question; today switches, the revised page stays on it (counted)', async () => {
    mockApp.user = withLeftovers();
    mockApp.logs = [sessionLog(TODAY, todayOf(mockApp.user as User), [28])];
    await loadSavedPlanAndSave();
    expect(screen.queryByTestId('plan-start-menu')).toBeNull();
    expect(todayOf(savedUser())).toEqual([28, 1, 2]);
    expect(todayOf(savedUser(), tomorrow)).toEqual([3, 4]);
  });

  it('today already done: today still switches to the new plan, nothing deferred, nothing asked', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApp.user = withLeftovers();
    const before = todayOf(mockApp.user as User);
    mockApp.logs = [sessionLog(TODAY, before, before)];
    await loadSavedPlanAndSave();
    expect(todayOf(savedUser())).toEqual([...before, 1, 2].filter((p, i, a) => a.indexOf(p) === i));
    expect(todayOf(savedUser(), tomorrow)).toEqual([3, 4]);
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('5 of 10 done, today and tomorrow swapped in the editor: 5 of 15, saved without a question', async () => {
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    mockApp.user = {
      ...baseUser,
      dailyPageCapacity: 10,
      customPlan: { days: [range(1, 10), range(11, 20), range(21, 30)], cycleStartDate: TODAY, direction: 'forward' },
    };
    mockApp.logs = [sessionLog(TODAY, range(1, 10), range(1, 5))];
    await mount(<PlanEditScreen />);
    // Today's day moved down a place: tomorrow's pages come to today.
    fireEvent(screen.getByTestId('day-item-0'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByTestId('plan-save'));
    });
    const today = todayOf(savedUser());
    expect(today).toEqual([...range(1, 5), ...range(11, 20)]);
    expect(today.filter((p: number) => p <= 5)).toHaveLength(5);
    expect(todayOf(savedUser(), tomorrow)).toEqual(range(1, 10));
  });

  it('Use automatic schedule: today switches to the automatic day (leftovers go)', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockApp.user = { ...withLeftovers(), customPlan: { days: [[1, 2], [3, 4]], cycleStartDate: TODAY, direction: 'forward' } };
    mockApp.logs = [];
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-automatic'));
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Use Automatic')!.onPress!();
    });
    const automatic = { ...baseUser, customPlan: null };
    expect(todayOf(savedUser())).toEqual(todayOf(automatic));
    alert.mockRestore();
  });
});

describe('the plan’s name in the header (SCHED-7)', () => {
  const { dateToLocalISODay } = require('../../../lib/schedulePlans');
  const day0 = new Date();
  day0.setHours(0, 0, 0, 0);
  const TODAY = dateToLocalISODay(day0);
  const hero = () => screen.getByTestId('plan-hero');
  const savedUser = (): User => (mockApp.saveUser as jest.Mock).mock.calls.at(-1)[0];
  const live = (name?: string) => ({
    days: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    cycleStartDate: TODAY,
    direction: 'forward' as const,
    ...(name ? { name } : {}),
  });

  async function loadSaved() {
    fireEvent.press(screen.getByTestId('saved-plan-p1'));
    await act(async () => {});
    fireEvent.press(within(screen.getByTestId('saved-plan-menu')).getByTestId('sheet-action-load'));
    await act(async () => {
      screen.UNSAFE_getAllByType(Modal).find((m) => m.props.visible)?.props.onDismiss?.();
    });
  }
  async function save() {
    await act(async () => {
      fireEvent.press(screen.getByTestId('plan-save'));
    });
  }
  async function saveCurrentAs(name: string) {
    fireEvent.press(screen.getByTestId('plan-save-current'));
    fireEvent.changeText(screen.getByTestId('plan-name'), name);
    await act(async () => {
      fireEvent.press(within(screen.getByTestId('gorhom-sheet')).getByText('Save'));
    });
  }

  it('[SCHED-7] a loaded saved plan is named in the header, and saving it keeps the name', async () => {
    await mount(<PlanEditScreen />);
    expect(within(hero()).getByText('Automatic')).toBeTruthy();
    await loadSaved();
    expect(within(hero()).getByText('Ramadan rotation')).toBeTruthy();
    expect(within(hero()).queryByText('Custom plan')).toBeNull();
    await save();
    expect(savedUser().customPlan).toMatchObject({ name: 'Ramadan rotation', days: [[1, 2], [3, 4]] });
  });

  it('[SCHED-7] a named live plan shows its name; an edit keeps it, with “Unsaved changes” until saved', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live('Weekdays') };
    await mount(<PlanEditScreen />);
    expect(within(hero()).getByText('Weekdays')).toBeTruthy();
    expect(screen.queryByTestId('plan-dirty')).toBeNull();
    fireEvent.press(screen.getByTestId('plan-add-day'));
    expect(within(hero()).getByText('Weekdays')).toBeTruthy();
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
    await save();
    expect(savedUser().customPlan).toMatchObject({ name: 'Weekdays' });
    expect(savedUser().customPlan!.days).toHaveLength(4);
  });

  it('[SCHED-7] a custom plan without a name is “Custom plan”', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live() };
    await mount(<PlanEditScreen />);
    expect(within(hero()).getByText('Custom plan')).toBeTruthy();
  });

  it('[SCHED-7] “Create new plan” makes a plan with no name: “Custom plan”, saved without one', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live('Weekdays') };
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-create'));
    await act(async () => {
      fireEvent.press(within(screen.getByTestId('gorhom-sheet')).getByText('Apply'));
    });
    expect(within(hero()).getByText('Custom plan')).toBeTruthy();
    await save();
    expect(savedUser().customPlan).not.toHaveProperty('name');
  });

  it('[SCHED-7] saving the live custom plan under a name names it at once, without touching its days', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live() };
    await mount(<PlanEditScreen />);
    await saveCurrentAs('Weekdays');
    const after = savedUser();
    expect(after.customPlan).toEqual(live('Weekdays'));
    expect(after.savedPlans.map((p) => p.name)).toEqual(['Ramadan rotation', 'Weekdays']);
    expect(within(hero()).getByText('Weekdays')).toBeTruthy();
  });

  it('[SCHED-7] saving an edited draft under a name names the draft; Save then keeps the name', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live() };
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-add-day'));
    await saveCurrentAs('Weekdays');
    // The saved plan is stored; the live plan waits for Save, like the edit.
    expect(savedUser().customPlan).toEqual(live());
    expect(within(hero()).getByText('Weekdays')).toBeTruthy();
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
    await save();
    expect(savedUser().customPlan).toMatchObject({ name: 'Weekdays' });
    expect(savedUser().customPlan!.days).toHaveLength(4);
  });

  it('[SCHED-7] on the automatic schedule, saving it under a name keeps a copy and leaves it automatic', async () => {
    await mount(<PlanEditScreen />);
    await saveCurrentAs('Weekdays');
    expect(savedUser().customPlan).toBeNull();
    expect(within(hero()).getByText('Automatic')).toBeTruthy();
    expect(screen.queryByTestId('plan-dirty')).toBeNull();
  });
});

describe('memorized pages a custom plan doesn’t hold (MEM-6)', () => {
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  // Pages 1–30 memorized, the plan holding 1–28; and An-Nas alone memorized on the last page.
  // An account that isn't a tester (previewTester unset): MEM-6 is everyone's since the November 2026 release.
  const withPlan = (custom = true) => {
    Object.assign(mockApp, {
      user: { ...baseUser, customPlan: custom ? { days: [range(1, 10), range(11, 20), range(21, 28)], cycleStartDate: day, direction: 'forward' } : null },
      pages: [
        ...memorized,
        { ...memorized[0], pageNumber: 604, status: 'in_progress', verses: [114001, 114002, 114003, 114004, 114005, 114006] },
      ],
    });
  };

  it('[MEM-6] an account that isn’t a tester sees them, named by their ayahs, and adds them to tomorrow’s pages', async () => {
    withPlan();
    await mount(<PlanEditScreen />);
    expect(screen.getByText('Not in your plan')).toBeTruthy();
    expect(screen.getByText(/Al.Baqarah .* and An.Nas/)).toBeTruthy();
    expect(within(screen.getByTestId('plan-not-in-plan')).getByText('3 pages')).toBeTruthy();
    fireEvent.press(screen.getByTestId('plan-not-in-plan'));
    await act(async () => {});
    expect(screen.getByText('With tomorrow’s pages')).toBeTruthy();
    expect(screen.getByText('10 pages, then 13 pages')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-action-tomorrow'));
    // The action runs once the menu has gone (iOS: the modal's dismissal).
    await act(async () => {
      screen.UNSAFE_getAllByType(Modal).find((m) => m.props.visible)?.props.onDismiss?.();
    });
    // In the plan now (not saved yet): the section goes, and Save comes on.
    expect(screen.queryByText('Not in your plan')).toBeNull();
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
  });

  it('[MEM-6] as a day of its own, tomorrow: the cycle grows by a day', async () => {
    withPlan();
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-not-in-plan'));
    await act(async () => {});
    expect(screen.getByText('The cycle becomes 4 days')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-action-own'));
    // The action runs once the menu has gone (iOS: the modal's dismissal).
    await act(async () => {
      screen.UNSAFE_getAllByType(Modal).find((m) => m.props.visible)?.props.onDismiss?.();
    });
    expect(within(screen.getByTestId('plan-hero')).getByText('Repeats every 4 days')).toBeTruthy();
  });

  it('[MEM-6] not on the automatic schedule, which holds every memorized page', async () => {
    withPlan(false);
    await mount(<PlanEditScreen />);
    expect(screen.queryByText('Not in your plan')).toBeNull();
  });
});
