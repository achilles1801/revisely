import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../modules/install-source', () => ({ __esModule: true, default: null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// DesignGate reads the signed-in user.
let mockAppUser: { accent?: string; previewTester?: boolean } | null = null;
jest.mock('../../context/AppContext', () => ({ useApp: () => ({ user: mockAppUser }) }));

import { DesignProvider, useDesign } from '../DesignContext';
import { makeHaptics } from '../haptics';
import { ThemeProvider, isExistingInstall, resolveThemeMode, useTheme } from '../../context/ThemeContext';
import { PressableScale } from '../../components/PressableScale';
import { TodayPost, juzLabel, memorizedText, todayText } from '../../components/home/feed/TodayPost';
import { revisionItem } from '../../lib/activityItems';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { AccentPicker } from '../../components/settings/AccentPicker';
import { DesignGate as DesignGateForAccent } from '../DesignGate';
import { dayAgo } from '../../lib/dayAgo';
import { ACCENTS, AccentName, DEFAULT_ACCENT, HERO_FIRST_TEXT_OFFSET, paletteDark, paletteLight, paletteV2, v2ThemeColors } from '../../theme/v2';
import type { RevisionLog, UserPage } from '../../types';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

function Probe() {
  const d = useDesign();
  return (
    <>
      <Text testID="state">{`${d.accent}|${d.hapticsOn}`}</Text>
      <Text onPress={() => d.setAccent('crimson')}>crimson</Text>
      <Text onPress={() => d.setHapticsOn(false)}>haptics off</Text>
    </>
  );
}

describe('DesignContext', () => {
  it('is the new design, whatever a device stored before the switch was removed', async () => {
    await AsyncStorage.setItem('@revisely_design', 'classic');
    render(
      <DesignProvider>
        <Probe />
      </DesignProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('state').props.children).toBe('indigo|true');
  });

  it('keeps the accent and the Haptics setting on the device', async () => {
    render(
      <DesignProvider>
        <Probe />
      </DesignProvider>,
    );
    await act(async () => {});
    fireEvent.press(screen.getByText('crimson'));
    fireEvent.press(screen.getByText('haptics off'));
    expect(screen.getByTestId('state').props.children).toBe('crimson|false');
    expect(await AsyncStorage.getItem('@revisely_accent')).toBe('crimson');
    expect(await AsyncStorage.getItem('@revisely_haptics')).toBe('off');
    screen.unmount();
    render(
      <DesignProvider>
        <Probe />
      </DesignProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('state').props.children).toBe('crimson|false');
  });

  it('without a provider: the new design, Indigo, haptics on', () => {
    render(<Probe />);
    expect(screen.getByTestId('state').props.children).toBe('indigo|true');
  });
});

describe('haptics', () => {
  it('taps don’t buzz', () => {
    render(
      <DesignProvider initial={{}}>
        <PressableScale onPress={() => undefined} testID="btn">
          <Text>Go</Text>
        </PressableScale>
      </DesignProvider>,
    );
    fireEvent.press(screen.getByTestId('btn'));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('meaningful haptics follow the Haptics setting', () => {
    makeHaptics(false).success();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    makeHaptics(true).success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');
  });
});

describe('the theme (Light / Dark)', () => {
  it('a fresh install starts in light; System once the binary follows it', () => {
    expect(resolveThemeMode(null, null, false, false)).toBe('light');
    expect(resolveThemeMode(null, null, true, false)).toBe('system');
  });

  it('a phone that ran the app before and never chose stays dark, as classic showed it', () => {
    expect(resolveThemeMode(null, null, false, true)).toBe('dark');
    expect(isExistingInstall(['firebase:authUser:key:[DEFAULT]'])).toBe(true);
    expect(isExistingInstall(['@revisely_haptics', 'x'])).toBe(true);
    expect(isExistingInstall(['@revisley_reader_guide_dismissed'])).toBe(true);
    expect(isExistingInstall([])).toBe(false);
  });

  it('keeps what someone chose: here, or else in the classic design (its System was dark)', () => {
    expect(resolveThemeMode('dark', 'light', false, true)).toBe('dark');
    expect(resolveThemeMode('light', null, false, true)).toBe('light');
    expect(resolveThemeMode(null, 'dark', false, false)).toBe('dark');
    expect(resolveThemeMode(null, 'light', true, true)).toBe('light');
    expect(resolveThemeMode(null, 'system', false, true)).toBe('dark');
  });

  it('a stored System this binary can’t follow falls back to the classic choice, else as above', () => {
    expect(resolveThemeMode('system', 'dark', false, true)).toBe('dark');
    expect(resolveThemeMode('system', null, false, false)).toBe('light');
    expect(resolveThemeMode('system', 'dark', true, true)).toBe('system');
  });

  it('decides once: a fresh install stays light on its next launch, though it now has keys', async () => {
    const Probe = () => <Text testID="mode">{useTheme().themeMode}</Text>;
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('mode').props.children).toBe('light');
    expect(await AsyncStorage.getItem('@revisely_theme_v2')).toBe('light');
    await AsyncStorage.setItem('@revisely_haptics', 'on');
    screen.unmount();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('mode').props.children).toBe('light');
  });

  it('an existing install that never chose opens dark, and keeps it', async () => {
    await AsyncStorage.setItem('firebase:authUser:key:[DEFAULT]', '{}');
    const Probe = () => <Text testID="mode">{useTheme().themeMode}</Text>;
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('mode').props.children).toBe('dark');
    expect(await AsyncStorage.getItem('@revisely_theme_v2')).toBe('dark');
  });
});

describe('v2 palette (white and black grounds, no accent tint)', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('is the agreed palette', () => {
    expect([paletteLight.bg, paletteLight.text, paletteLight.secondary, paletteLight.separator, paletteLight.red]).toEqual([
      '#FFFFFF',
      '#1A1A1A',
      '#616977',
      '#E5E7EB',
      '#DC2626',
    ]);
    expect([paletteDark.bg, paletteDark.text, paletteDark.secondary, paletteDark.separator, paletteDark.red]).toEqual([
      '#000000',
      '#FFFFFF',
      '#8A8A93',
      '#1F1F1F',
      '#F87171',
    ]);
    // The primary button is the ink: black in light, white in dark.
    expect(paletteLight.primary).toBe(paletteLight.text);
    expect(paletteDark.primary).toBe('#FFFFFF');
  });

  const combos = ACCENTS.flatMap((a) => [
    [`${a}, light`, a, false],
    [`${a}, dark`, a, true],
  ]) as [string, AccentName, boolean][];

  it.each(combos)('%s: every text colour reads at 4.5:1 or more on the ground, fills and sheets', (_name, accent, isDark) => {
    const p = paletteV2(isDark, accent);
    for (const ground of [p.bg, p.fill, p.sheet]) {
      for (const ink of [p.text, p.secondary, p.red, p.good, p.doneText, p.accentText, p.link]) {
        expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The accent's tint marks a picked or running thing (a time, a drop slot,
    // the timer chip); its labels are ink or grey.
    for (const ink of [p.text, p.secondary]) {
      expect(contrast(ink, p.accentSubtle)).toBeGreaterThanOrEqual(4.5);
    }
    // Labels and glyphs on the accent's fills.
    expect(contrast(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.onDone, p.done)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.onAccentText, p.accentText)).toBeGreaterThanOrEqual(4.5);
    // The fills themselves stand out from the ground (non-text, 3:1).
    expect(contrast(p.primary, p.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.done, p.bg)).toBeGreaterThanOrEqual(3);
    // A day's number on each shade of Activity's calendar.
    p.heat.forEach((shade, i) => expect(contrast(p.heatInk[i], shade)).toBeGreaterThanOrEqual(4.5));
    // Screens not moved yet get the same colours under the classic names.
    const c = v2ThemeColors(isDark, accent);
    for (const ink of [c.textPrimary, c.textSecondary, c.textMuted, c.warning, c.warningText, c.error, c.success, c.accent]) {
      expect(contrast(ink, c.bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textInverse, c.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('Jade is the design as agreed: ink buttons, grey links; a jade glow in light only', () => {
    expect([paletteLight.primary, paletteLight.link, paletteLight.done]).toEqual(['#1A1A1A', '#616977', '#0E6B5A']);
    expect(paletteLight.hero?.[0].color).toBe('#3FA084');
    expect([paletteDark.primary, paletteDark.link, paletteDark.done, paletteDark.hero]).toEqual(['#FFFFFF', '#8A8A93', '#4DBA9F', null]);
    // Classic names, as before the accents.
    expect(v2ThemeColors(false).accent).toBe('#1A1A1A');
    expect(v2ThemeColors(true).accent).toBe('#FFFFFF');
  });

  it('Crimson and Indigo start from the colours sampled off the reference apps', () => {
    const crimson = paletteV2(true, 'crimson');
    expect([crimson.primary, crimson.done, crimson.link, crimson.accentSubtle]).toEqual(['#DC1433', '#DC1433', '#F03C56', '#2E0E15']);
    expect(crimson.hero?.map((s) => s.color)).toEqual(['#3E0812', '#33080E', '#2E0E15']);
    expect(paletteV2(false, 'crimson').link).toBe('#DC1433');
    const indigo = paletteV2(true, 'indigo');
    expect([indigo.primary, indigo.done, indigo.link]).toEqual(['#624BD5', '#624BD5', '#9789DA']);
    expect(indigo.hero?.[0].color).toBe('#2E0EC6');
    expect(paletteV2(false, 'indigo').heat.slice(1, 4)).toEqual(['#9789DA', '#624BD5', '#2E0EC6']);
  });
});

describe('Home’s glow in light', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  /** The accent at `alpha` over the ground, as the screen composites it. */
  const over = (color: string, alpha: number, ground: string) =>
    '#' +
    [0, 1, 2]
      .map((i) => Math.round(channel(color, i) * alpha + channel(ground, i) * (1 - alpha)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  const alphaAt = (stops: readonly { offset: number; opacity: number }[], offset: number) => {
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      if (offset <= b.offset) return a.opacity + ((offset - a.offset) / (b.offset - a.offset)) * (b.opacity - a.opacity);
    }
    return 0;
  };

  it.each(ACCENTS)('%s: clearly there behind the top bar, gone before the first grey text', (accent) => {
    const p = paletteV2(false, accent);
    expect(p.hero).not.toBeNull();
    const stops = p.hero!;
    // Visible: at least a fifth of the accent at the top.
    expect(stops[0].opacity).toBeGreaterThanOrEqual(0.2);
    // The top bar's ink and Home's first grey line stay readable over it.
    expect(contrast(p.text, over(stops[0].color, stops[0].opacity, p.bg))).toBeGreaterThanOrEqual(4.5);
    const atText = over(stops[0].color, alphaAt(stops, HERO_FIRST_TEXT_OFFSET), p.bg);
    expect(contrast(p.secondary, atText)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.link, atText)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark is as it was', () => {
    expect(paletteV2(true, 'indigo').hero?.[0]).toEqual({ offset: 0, color: '#2E0EC6', opacity: 0.45 });
    expect(paletteV2(true, 'crimson').hero?.[0]).toEqual({ offset: 0, color: '#3E0812', opacity: 1 });
    expect(paletteV2(true, 'jade').hero).toBeNull();
  });
});

describe('the accent (Settings → Appearance)', () => {
  function AccentProbe() {
    const { accent, setAccent } = useDesign();
    const { palette, theme } = useTheme();
    return (
      <>
        <Text testID="accent">{`${accent}|${palette.primary}|${theme.accent}`}</Text>
        <Text onPress={() => setAccent('crimson')}>crimson</Text>
      </>
    );
  }

  it('switches the whole palette live and is kept on the device', async () => {
    await AsyncStorage.setItem('@revisely_theme_v2', 'light');
    render(
      <DesignProvider initial={{}}>
        <ThemeProvider>
          <AccentProbe />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
    // Indigo until something else is chosen.
    expect(screen.getByTestId('accent').props.children).toBe('indigo|#624BD5|#624BD5');
    fireEvent.press(screen.getByText('crimson'));
    expect(screen.getByTestId('accent').props.children).toBe('crimson|#DC1433|#DC1433');
    expect(await AsyncStorage.getItem('@revisely_accent')).toBe('crimson');
  });

  it("follows the account: its choice once loaded, Indigo when it hasn't chosen", async () => {
    await AsyncStorage.setItem('@revisely_theme_v2', 'light');
    mockAppUser = { accent: 'crimson' };
    const ui = () => (
      <DesignProvider initial={{ accent: 'jade' }}>
        <ThemeProvider>
          <DesignGateForAccent />
          <AccentProbe />
        </ThemeProvider>
      </DesignProvider>
    );
    const { rerender } = render(ui());
    await act(async () => {});
    expect(screen.getByTestId('accent').props.children).toMatch(/^crimson\|/);
    mockAppUser = {};
    rerender(ui());
    await act(async () => {});
    expect(screen.getByTestId('accent').props.children).toMatch(/^indigo\|/);
  });

  it('the picker offers Indigo, Crimson and Jade with swatches, and reports a new choice', async () => {
    await AsyncStorage.setItem('@revisely_theme_v2', 'light');
    const onChange = jest.fn();
    render(wrap(<AccentPicker value="indigo" onChange={onChange} />));
    await act(async () => {});
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual(['Indigo', 'Crimson', 'Jade']);
    fireEvent.press(screen.getByTestId('accent-indigo'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('accent-jade'));
    expect(onChange).toHaveBeenCalledWith('jade');
  });
});

describe('ThemeContext in the new design', () => {
  function Mode() {
    const { themeMode, isDark, theme } = useTheme();
    return <Text testID="mode">{`${themeMode}|${isDark}|${theme.bg}`}</Text>;
  }
  const renderTheme = async () => {
    render(
      <DesignProvider initial={{}}>
        <ThemeProvider>
          <Mode />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
    return screen.getByTestId('mode').props.children as string;
  };

  it('this binary pins light mode, so "System" falls back to the classic choice, on the v2 palette', async () => {
    await AsyncStorage.setItem('@revision_buddy_theme', 'dark');
    expect(await renderTheme()).toBe(`dark|true|${paletteDark.bg}`);
    await AsyncStorage.setItem('@revisely_theme_v2', 'light');
    screen.unmount();
    expect(await renderTheme()).toBe(`light|false|${paletteLight.bg}`);
  });

  it('once the binary follows the system, System is the default', async () => {
    const config = Constants.expoConfig as { userInterfaceStyle?: string };
    config.userInterfaceStyle = 'automatic';
    try {
      expect((await renderTheme()).startsWith('system|')).toBe(true);
    } finally {
      delete config.userInterfaceStyle;
    }
  });
});

const wrap = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

describe('Home in the new design (a feed)', () => {
  beforeEach(() => AsyncStorage.setItem('@revisely_theme_v2', 'light'));
  it('today is real pages, juz and surahs in one post, never "Juz 27 + 1 more"', () => {
    const pages = Array.from({ length: 20 }, (_, i) => 503 + i);
    const juz = [
      { juz: 26, pages: pages.slice(0, 19) },
      { juz: 27, pages: pages.slice(19) },
    ];
    expect(todayText('not_started', pages, new Set(), juz)).toEqual({
      title: 'Pages 503–522',
      detail: '20 pages · Juz 26–27 · Al-Ahqaf to Adh-Dhariyat',
      cta: 'Start revision',
      solid: true,
    });
    expect(todayText('partial', pages, new Set([503, 504]), juz).detail).toBe('2 of 20 done · Juz 26–27 · Al-Ahqaf to Adh-Dhariyat');
    expect(todayText('completed', pages, new Set(pages))).toMatchObject({ title: 'Done for today', solid: false });
    expect(todayText('not_started', [], new Set()).title).toBe('Nothing to revise yet');
  });

  it('names the juz briefly', () => {
    expect(juzLabel([{ juz: 30 }])).toBe('Juz 30');
    expect(juzLabel([{ juz: 27 }, { juz: 26 }])).toBe('Juz 26–27');
    expect(juzLabel([{ juz: 3 }, { juz: 7 }])).toBe('Juz 3, 7');
    expect(juzLabel([{ juz: 1 }, { juz: 3 }, { juz: 5 }, { juz: 9 }])).toBe('4 juz');
    expect(juzLabel([])).toBe('');
  });

  const post = (over: Partial<React.ComponentProps<typeof TodayPost>> = {}) => {
    const props: React.ComponentProps<typeof TodayPost> = {
      name: 'Karim',
      initial: 'K',
      status: 'partial',
      pages: [520, 521, 522],
      juzBreakdown: [
        { juz: 26, pages: [520, 521] },
        { juz: 27, pages: [522] },
      ],
      done: new Set([520, 521]),
      streak: 7,
      memorized: '8.1 of 30 juz · 166 of 604 pages',
      onPrimary: jest.fn(),
      onEditSchedule: jest.fn(),
      onMemorization: jest.fn(),
      leftovers: 0,
      onCarryOver: jest.fn(),
      carrying: false,
      onPushBack: jest.fn(),
      canPushBack: true,
      shifting: false,
      ...over,
    };
    render(wrap(<TodayPost {...props} />));
    return props;
  };

  it('today is one post: the pages, the action, and how much is memorized (no juz replies)', async () => {
    const props = post();
    await act(async () => {});
    expect(screen.getByText('Karim')).toBeTruthy();
    expect(screen.getByText('Today · 7-day streak')).toBeTruthy();
    expect(screen.getByText('2 of 3 done · Juz 26–27 · Qaf to Adh-Dhariyat')).toBeTruthy();
    expect(screen.queryByTestId('thread-line')).toBeNull();
    expect(screen.queryByText('Juz 26')).toBeNull();
    fireEvent.press(screen.getByTestId('today-cta'));
    expect(props.onPrimary).toHaveBeenCalled();
    expect(screen.queryByTestId('today-carry-over')).toBeNull();
    expect(screen.getByText('Memorized 8.1 of 30 juz · 166 of 604 pages')).toBeTruthy();
    fireEvent.press(screen.getByTestId('today-memorized'));
    expect(props.onMemorization).toHaveBeenCalled();
  });

  it('leaves memorized out when Settings turns it off', async () => {
    post({ memorized: null });
    await act(async () => {});
    expect(screen.queryByTestId('today-memorized')).toBeNull();
  });

  it('the primary button is solid in the accent (Indigo by default); yesterday’s leftovers are an outline pill', async () => {
    const props = post({ leftovers: 3 });
    await act(async () => {});
    const flat = (id: string) => Object.assign({}, ...[screen.getByTestId(id).props.style].flat(3).filter(Boolean));
    expect(flat('today-cta').backgroundColor).toBe(paletteV2(false, DEFAULT_ACCENT).primary);
    expect(flat('today-carry-over').borderWidth).toBe(1);
    fireEvent.press(screen.getByText('Add 3 from yesterday'));
    expect(props.onCarryOver).toHaveBeenCalled();
  });

  it('⋯ opens the menu; its action runs once the sheet has gone', async () => {
    const props = post();
    await act(async () => {});
    fireEvent.press(screen.getByTestId('today-post-menu'));
    expect(screen.getByText('Edit schedule')).toBeTruthy();
    fireEvent.press(screen.getByText('Edit schedule'));
    expect(props.onEditSchedule).not.toHaveBeenCalled();
  });

  it('"back a day" only when there is a day before today to go back to', async () => {
    post({ canPushBack: false });
    await act(async () => {});
    fireEvent.press(screen.getByTestId('today-post-menu'));
    expect(screen.getByText('Edit schedule')).toBeTruthy();
    expect(screen.queryByText(/back a day/)).toBeNull();
    screen.unmount();
    post({ canPushBack: true });
    await act(async () => {});
    fireEvent.press(screen.getByTestId('today-post-menu'));
    expect(screen.getByText('Behind? Move the plan back a day')).toBeTruthy();
  });

  it('sessions read as what was done, then the pages and surahs', () => {
    const log: RevisionLog = {
      id: 'a',
      date: '2026-10-24',
      assignedPages: [503, 504, 505, 506],
      pagesRevised: [503, 504, 505],
      pagesSkipped: [506],
      weaknessUpdates: [],
      durationMinutes: 24,
    };
    expect(revisionItem(log)).toMatchObject({
      title: 'Revised 3 of 4 pages',
      detail: 'Pages 503–506 · 24 min · Al-Ahqaf',
      done: false,
      day: '2026-10-24',
    });
    expect(revisionItem({ ...log, pagesRevised: [503, 504, 505, 506], pagesSkipped: [] })).toMatchObject({
      title: 'Revised 4 pages',
      done: true,
    });
    expect(dayAgo('2026-10-26', '2026-10-26')).toBe('Today');
    expect(dayAgo('2026-10-25', '2026-10-26')).toBe('Yesterday');
    expect(dayAgo('2026-10-12', '2026-10-26')).toBe('2w');
    expect(dayAgo('2026-08-01', '2026-10-26')).toBe('Aug 1');
    expect(dayAgo('2025-08-01', '2026-10-26')).toBe('Aug 1, 2025');
  });

  it('memorized is one line, in the order Settings chose', () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({ pageNumber: 582 + i, status: 'memorized' }) as UserPage);
    expect(memorizedText(pages, ['pages', 'juz']).body).toMatch(/^20 of 604 pages · .+ of 30 juz$/);
  });
});

describe('ActionSheet (the ⋯ menu)', () => {
  beforeEach(() => AsyncStorage.setItem('@revisely_theme_v2', 'light'));
  it('runs the chosen action after the sheet is dismissed, and Cancel closes it', async () => {
    const onPress = jest.fn();
    const onClose = jest.fn();
    const ui = (visible: boolean) =>
      wrap(
        <ActionSheet
          visible={visible}
          onClose={onClose}
          title="Session"
          actions={[{ key: 'delete', label: 'Delete session', icon: 'trash-outline', destructive: true, onPress }]}
        />,
      );
    render(ui(true));
    await act(async () => {});
    expect(screen.getByText('Session')).toBeTruthy();
    expect(screen.getByText('Delete session').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: paletteLight.red })]),
    );
    fireEvent.press(screen.getByTestId('sheet-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Delete session'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPress).not.toHaveBeenCalled();
    // The parent closes it; once the modal is gone (iOS: onDismiss) the action runs.
    screen.rerender(ui(false));
    const { Modal } = jest.requireActual('react-native');
    act(() => screen.UNSAFE_getByType(Modal).props.onDismiss());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
