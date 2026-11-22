// Edit schedule (Home → today's › → Edit schedule; SCHED-8, option B of the Edit schedule audit): the header that
// says how often each page comes round, the settings that build the days, a day in one sheet, saved plans under
// More, one Save.
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


const savedUser = (): User => (mockApp.saveUser as jest.Mock).mock.calls.at(-1)[0];
const hero = () => screen.getByTestId('plan-hero');
async function save() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('plan-save'));
  });
}
// A v2 ActionSheet's action runs once the menu has gone (iOS: the modal's dismissal).
async function pickAction(key: string) {
  fireEvent.press(screen.getByTestId(`sheet-action-${key}`));
  await act(async () => {
    screen.UNSAFE_getAllByType(Modal).find((m) => m.props.visible)?.props.onDismiss?.();
  });
}
async function loadSaved(id = 'p1') {
  fireEvent.press(screen.getByTestId('plan-saved-plans'));
  await act(async () => {});
  fireEvent.press(screen.getByTestId(`saved-plan-load-${id}`));
  await act(async () => {});
}

describe('the schedule’s help (HELP-1, HELP-3)', () => {
  it('a ? before Save; its sheet explains the cycle and the settings, and with Smart Tracking off no weakest first', async () => {
    Object.assign(mockApp, { user: { ...baseUser, smartTrackingEnabled: false } });
    await mount(<PlanEditScreen />);
    fireEvent.press(await screen.findByTestId('help-button-schedule'));
    expect(await screen.findByTestId('help-sheet-schedule')).toBeTruthy();
    expect(screen.getByText('How the schedule works')).toBeTruthy();
    expect(screen.getByTestId('help-topic-schedule.cycle')).toBeTruthy();
    expect(screen.getByTestId('help-topic-schedule.settings.off')).toBeTruthy();
    expect(screen.queryByTestId('help-topic-schedule.settings')).toBeNull();
    expect(screen.queryByText(/weakest/i)).toBeNull();
  });

  it('with Smart Tracking on, the settings can put the weakest pages first', async () => {
    Object.assign(mockApp, { user: { ...baseUser, smartTrackingEnabled: true } });
    await mount(<PlanEditScreen />);
    fireEvent.press(await screen.findByTestId('help-button-schedule'));
    expect(await screen.findByTestId('help-topic-schedule.settings')).toBeTruthy();
    expect(screen.queryByTestId('help-topic-schedule.settings.off')).toBeNull();
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

describe('Edit schedule (SCHED-8)', () => {
  it('a v2 top bar: back, “Edit schedule”, Save as a solid pill (off until something changes)', async () => {
    await mount(<PlanEditScreen />);
    expect(flat(screen.getByTestId('plan-edit').props.style).backgroundColor).toBe(palette.bg);
    expect(flat(screen.getByText('Edit schedule').props.style)).toMatchObject({ ...typeV2.barTitle, color: palette.text });
    expect(screen.getByTestId('plan-save').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('[SCHED-7] the header says how often each page comes round and how much a day, never “Automatic”', async () => {
    await mount(<PlanEditScreen />);
    expect(within(hero()).getByText('Every page, every 10 days')).toBeTruthy();
    expect(within(hero()).getByText('3 pages a day · 30 pages memorized')).toBeTruthy();
    expect(within(hero()).queryByText('Automatic')).toBeNull();
    expect(screen.queryByTestId('plan-custom-note')).toBeNull();
  });

  it('flat sections with bold headers; the settings first, the days, then More; no Create new plan or Daily amount', async () => {
    await mount(<PlanEditScreen />);
    for (const header of ['Each day', 'Your days', 'More']) {
      expect(flat(screen.getByText(header).props.style)).toMatchObject({ fontWeight: '600', color: palette.text });
    }
    for (const label of ['Revise by', 'Pages a day', 'Order', 'Al-Fatihah to An-Nas', 'Today starts at', 'Add a rest day', 'Saved plans']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('10 days')).toBeTruthy();
    expect(flat(screen.getByText('Show all 10 days').props.style).color).toBe(palette.link);
    expect(screen.queryByText('Create new plan')).toBeNull();
    expect(screen.queryByText('Daily amount')).toBeNull();
    expect(screen.queryByText('Reset to automatic')).toBeNull();
  });

  it('the days: the date column in sentence case, today in the accent, content as a feed row', async () => {
    await mount(<PlanEditScreen />);
    expect(screen.getByTestId('day-item-6')).toBeTruthy();
    expect(screen.queryByTestId('day-item-7')).toBeNull();
    const today = within(screen.getByTestId('date-badge-0')).getByText('Today');
    expect(flat(today.props.style).color).toBe(palette.accentText);
    expect(flat(screen.getByTestId('day-title-0').props.style)).toMatchObject({ ...typeV2.name, color: palette.text });
    fireEvent.press(screen.getByTestId('plan-show-all'));
    expect(screen.getByTestId('day-item-9')).toBeTruthy();
  });

  it('[SCHED-8] [MEM-6] one more page a day: the header and the days change at once; saved, it stays automatic', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByLabelText('Increase pages a day'));
    expect(within(hero()).getByText('Every page, every 8 days')).toBeTruthy();
    expect(within(hero()).getByText('4 pages a day · 30 pages memorized')).toBeTruthy();
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
    expect(screen.queryByTestId('plan-custom-note')).toBeNull();
    expect(screen.getByTestId('plan-save').props.accessibilityState).toMatchObject({ disabled: false });
    await save();
    expect(savedUser()).toMatchObject({ customPlan: null, dailyPageCapacity: 4, scheduleMode: 'pages' });
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('[SCHED-8] revising by juz: Ajzaʼ a day, whole juz each day; saved as the automatic juz schedule', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(within(screen.getByTestId('plan-by')).getByText('Juz'));
    expect(screen.getByText('Ajzaʼ a day')).toBeTruthy();
    expect(within(hero()).getByText('1 juz a day · 30 pages memorized')).toBeTruthy();
    expect(within(hero()).getByText('Every page, every 2 days')).toBeTruthy();
    await save();
    expect(savedUser()).toMatchObject({ customPlan: null, scheduleMode: 'juz', dailyJuzCount: 1 });
  });

  it('[SCHED-8] [MEM-6] An-Nas to Al-Fatihah makes a custom plan, and says before Save that new pages won’t join it', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-order'));
    await act(async () => {});
    expect(screen.queryByTestId('sheet-action-weakest')).toBeNull();
    await pickAction('reverse');
    expect(within(screen.getByTestId('plan-order')).getByText('An-Nas to Al-Fatihah')).toBeTruthy();
    expect(screen.getByTestId('plan-custom-note')).toBeTruthy();
    await save();
    expect(savedUser().customPlan).toMatchObject({ direction: 'reverse' });
  });

  it('[SCHED-8] with Smart Tracking on, Order offers weakest first, which has no start of its own', async () => {
    Object.assign(mockApp, { user: { ...baseUser, smartTrackingEnabled: true } });
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-order'));
    await act(async () => {});
    await pickAction('weakest');
    expect(within(screen.getByTestId('plan-order')).getByText('Weakest first')).toBeTruthy();
    expect(screen.queryByTestId('plan-start')).toBeNull();
  });

  it('[SCHED-8] Today starts at: a surah of what’s memorized; today begins there and the days after carry on', async () => {
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-start'));
    await act(async () => {});
    fireEvent.press(within(screen.getByTestId('picker-tabs')).getByTestId('pill-page'));
    fireEvent.press(screen.getByTestId('picker-item-page:10'));
    await act(async () => {});
    await save();
    const { getPagesScheduledForDate } = require('../../../lib/algorithm');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    expect(getPagesScheduledForDate(savedUser(), d, memorized)).toEqual([10, 11, 12]);
    expect(savedUser().customPlan).toBeNull();
  });

  it('[SCHED-8] [MEM-6] a day in one sheet: Make it a rest day → Done changes the day; on the automatic schedule it says new pages won’t join', async () => {
    await mount(<PlanEditScreen />);
    fireEvent(screen.getByTestId('day-item-1'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    await act(async () => {});
    expect(screen.getByTestId('day-sheet')).toBeTruthy();
    expect(screen.getByText('On this day')).toBeTruthy();
    expect(screen.getByText('Add a surah or juz')).toBeTruthy();
    expect(flat(screen.getByText('Delete this day').props.style).color).toBe(palette.red);
    fireEvent.press(screen.getByTestId('day-make-rest'));
    await act(async () => {
      fireEvent.press(within(screen.getByTestId('gorhom-sheet')).getByText('Done'));
    });
    expect(screen.getByTestId('plan-custom-note')).toBeTruthy();
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
    await save();
    expect(savedUser().customPlan!.days[1]).toEqual([]);
  });

  it('a day’s surah unchecked comes off it and stays listed to check again', async () => {
    await mount(<PlanEditScreen />);
    fireEvent(screen.getByTestId('day-item-0'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    await act(async () => {});
    const id = screen.getAllByTestId(/^surah-row-/)[0].props.testID as string;
    expect(within(screen.getByTestId(id)).getByTestId('icon-checkmark-circle')).toBeTruthy();
    fireEvent.press(screen.getByTestId(id));
    expect(within(screen.getByTestId(id)).getByTestId('icon-ellipse-outline')).toBeTruthy();
    fireEvent.press(screen.getByTestId(id));
    expect(within(screen.getByTestId(id)).getByTestId('icon-checkmark-circle')).toBeTruthy();
  });

  it('deleting a day shows the snackbar: ink ground, Undo puts the day back', async () => {
    await mount(<PlanEditScreen />);
    const before = screen.getByTestId('day-item-1').props.accessibilityLabel;
    fireEvent(screen.getByTestId('day-item-1'), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    await act(async () => {});
    const toast = screen.getByTestId('undo-toast');
    expect(within(toast).getByText(/deleted$/)).toBeTruthy();
    expect(flat(screen.getByTestId('undo-toast-bar').props.style)).toMatchObject({ backgroundColor: palette.text });
    fireEvent.press(screen.getByTestId('undo-toast-action'));
    await act(async () => {});
    expect(screen.getByTestId('day-item-1').props.accessibilityLabel).toBe(before);
  });

  it('[SCHED-8] days changed by hand, then one more page a day: rebuilt, and the header says so before Save', async () => {
    const { dateToLocalISODay } = require('../../../lib/schedulePlans');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    mockApp.user = { ...baseUser, customPlan: { days: [[1, 2, 3], [4, 5, 6]], cycleStartDate: dateToLocalISODay(d), direction: 'forward' } };
    await mount(<PlanEditScreen />);
    expect(screen.getByText('Reset to automatic')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Increase pages a day'));
    expect(screen.getByTestId('plan-rebuilt-note')).toBeTruthy();
    expect(within(hero()).getByText('Every page, every 8 days')).toBeTruthy();
    // Back to how it opened: the plan as it was, nothing to save.
    fireEvent.press(screen.getByLabelText('Decrease pages a day'));
    expect(screen.queryByTestId('plan-rebuilt-note')).toBeNull();
    expect(screen.queryByTestId('plan-dirty')).toBeNull();
    fireEvent.press(screen.getByLabelText('Increase pages a day'));
    await save();
    expect(savedUser()).toMatchObject({ customPlan: null, dailyPageCapacity: 4 });
  });

  it('[ACT-24] from “Add to your plan”: the day’s sheet opens with the pages on it, an edit that says it’s every cycle', async () => {
    const { dateToLocalISODay } = require('../../../lib/schedulePlans');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    mockApp.user = { ...baseUser, customPlan: { days: [[1, 2, 3], [4, 5, 6]], cycleStartDate: dateToLocalISODay(d), direction: 'forward' } };
    mockRoute.params = { openDay: { dayIndex: 1, initialPages: [4, 5, 6, 20], basePages: [4, 5, 6], note: 'Added to this day in every cycle' } };
    await mount(<PlanEditScreen />);
    expect(screen.getByTestId('day-sheet')).toBeTruthy();
    expect(screen.getByTestId('plan-day-note')).toBeTruthy();
    await act(async () => {
      fireEvent.press(within(screen.getByTestId('gorhom-sheet')).getByText('Done'));
    });
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
    await save();
    expect(savedUser().customPlan!.days[1]).toEqual([4, 5, 6, 20]);
  });

  it('Saved plans, from More: Load shows it here (named, not saved yet), the bin asks first', async () => {
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-saved-plans'));
    await act(async () => {});
    expect(within(screen.getByTestId('saved-plans-sheet')).getByText('Ramadan rotation')).toBeTruthy();
    expect(screen.getByText('2-day cycle')).toBeTruthy();
    fireEvent.press(screen.getByTestId('saved-plan-delete-p1'));
    expect(alert.mock.calls.at(-1)![0]).toBe('Delete "Ramadan rotation"?');
    fireEvent.press(screen.getByTestId('saved-plan-load-p1'));
    await act(async () => {});
    expect(within(hero()).getByText('Ramadan rotation')).toBeTruthy();
    expect(within(hero()).getByText('Every page, every 2 days')).toBeTruthy();
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
    alert.mockRestore();
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
    await loadSaved();
    await save();
  }

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

  it('Reset to automatic: today switches to the automatic day (leftovers go)', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockApp.user = { ...withLeftovers(), customPlan: { days: [[1, 2], [3, 4]], cycleStartDate: TODAY, direction: 'forward' } };
    mockApp.logs = [];
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-automatic'));
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Reset')!.onPress!();
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
  const live = (name?: string) => ({
    days: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    cycleStartDate: TODAY,
    direction: 'forward' as const,
    ...(name ? { name } : {}),
  });
  async function saveCopyAs(name: string) {
    fireEvent.press(screen.getByTestId('plan-saved-plans'));
    await act(async () => {});
    fireEvent.press(screen.getByTestId('plan-save-current'));
    fireEvent.changeText(screen.getByTestId('plan-name'), name);
    await act(async () => {
      fireEvent.press(within(screen.getAllByTestId('gorhom-sheet').at(-1)!).getByText('Save'));
    });
  }

  it('[SCHED-7] a loaded saved plan is named in the header, and saving it keeps the name', async () => {
    await mount(<PlanEditScreen />);
    expect(screen.queryByTestId('plan-name-line')).toBeNull();
    await loadSaved();
    expect(within(hero()).getByText('Ramadan rotation')).toBeTruthy();
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

  it('[SCHED-7] a custom plan without a name has no name line, only how often and how much', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live() };
    await mount(<PlanEditScreen />);
    expect(screen.queryByTestId('plan-name-line')).toBeNull();
    expect(within(hero()).getByText('Every page, every 3 days')).toBeTruthy();
    expect(within(hero()).queryByText('Custom plan')).toBeNull();
  });

  it('[SCHED-7] days rebuilt from the settings have no name: a named plan, one page more a day, saved without one', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live('Weekdays') };
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByLabelText('Increase pages a day'));
    expect(screen.queryByTestId('plan-name-line')).toBeNull();
    await save();
    expect(savedUser().customPlan).toBeNull();
  });

  it('[SCHED-7] saving the live custom plan as a copy names it at once, without touching its days', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live() };
    await mount(<PlanEditScreen />);
    await saveCopyAs('Weekdays');
    const after = savedUser();
    expect(after.customPlan).toEqual(live('Weekdays'));
    expect(after.savedPlans.map((p) => p.name)).toEqual(['Ramadan rotation', 'Weekdays']);
    expect(within(hero()).getByText('Weekdays')).toBeTruthy();
  });

  it('[SCHED-7] saving an edited draft as a copy names the draft; Save then keeps the name', async () => {
    mockApp.user = { ...baseUser, savedPlans: [saved], customPlan: live() };
    await mount(<PlanEditScreen />);
    fireEvent.press(screen.getByTestId('plan-add-day'));
    await saveCopyAs('Weekdays');
    // The saved plan is stored; the live plan waits for Save, like the edit.
    expect(savedUser().customPlan).toEqual(live());
    expect(within(hero()).getByText('Weekdays')).toBeTruthy();
    expect(screen.getByTestId('plan-dirty')).toBeTruthy();
    await save();
    expect(savedUser().customPlan).toMatchObject({ name: 'Weekdays' });
    expect(savedUser().customPlan!.days).toHaveLength(4);
  });

  it('[SCHED-7] on the automatic schedule, saving a copy keeps a copy and leaves it automatic', async () => {
    await mount(<PlanEditScreen />);
    await saveCopyAs('Weekdays');
    expect(savedUser().customPlan).toBeNull();
    expect(screen.queryByTestId('plan-name-line')).toBeNull();
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
    expect(within(screen.getByTestId('plan-hero')).getByText('Every page, every 4 days')).toBeTruthy();
  });

  it('[MEM-6] not on the automatic schedule, which holds every memorized page', async () => {
    withPlan(false);
    await mount(<PlanEditScreen />);
    expect(screen.queryByText('Not in your plan')).toBeNull();
  });
});
