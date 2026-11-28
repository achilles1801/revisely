// Home's today section as a ring (BEHAVIOUR.md HOME-10, Revisely Dev): what the ring holds in each state, the two lines
// under it with "Change" ending the second, and the button and quiet lines in their order.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name, testID }: { name: string; testID?: string }) => <Text testID={testID}>{name}</Text> };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../../context/AppContext', () => ({ useApp: () => ({ user: null }) }));

import { DesignProvider } from '../../../../design/DesignContext';
import { ThemeProvider } from '../../../../context/ThemeContext';
import { NBHY, NBSP, todayLines, type TodayStatus } from '../../../../lib/todayLines';
import { ringState, TodayRing } from '../TodayRing';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const plain = (s: string) => s.split(NBSP).join(' ').split(NBHY).join('-');
const HIDDEN = { includeHiddenElements: true } as const;
const textOf = (id: string) => {
  const el = screen.queryByTestId(id, HIDDEN);
  if (!el) return null;
  const flat = (n: unknown): string =>
    typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(flat).join('') : n && typeof n === 'object' && 'props' in n ? flat((n as { props: { children?: unknown } }).props.children) : '';
  return plain(flat(el.props.children));
};

function ring(status: TodayStatus, pages: number[], done: number[], over: Partial<React.ComponentProps<typeof TodayRing>> = {}, rest?: Parameters<typeof todayLines>[7]) {
  const doneSet = new Set(done);
  const lines = todayLines(status, pages, doneSet, 0, 0, undefined, 0, rest);
  const props: React.ComponentProps<typeof TodayRing> = {
    name: 'Maryam',
    initial: 'M',
    status,
    done: doneSet,
    streak: 12,
    onPrimary: jest.fn(),
    onJump: jest.fn(),
    catchUp: null,
    onCarryOver: jest.fn(),
    carrying: false,
    lines,
    ...over,
  };
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <TodayRing {...props} />
      </ThemeProvider>
    </DesignProvider>,
  );
  return props;
}

const drawn = () =>
  screen
    .queryAllByTestId(/^today-(ring|summary|cta|carry-over|ahead)$/, HIDDEN)
    .map((el) => el.props.testID as string);

beforeEach(() => AsyncStorage.setItem('@revisely_theme_v2', 'light'));

describe('Home’s ring (HOME-10)', () => {
  it('not started: the count in the ring, "Starts at …" over the rest of the day ending in Change, one button', async () => {
    const props = ring('not_started', range(562, 581), []);
    await act(async () => {});
    expect(textOf('today-ring-count')).toBe('20');
    expect(textOf('today-ring-label')).toBe('pages today');
    expect(screen.queryByTestId('today-ring-arc', HIDDEN)).toBeNull();
    expect(textOf('today-title')).toBe('Starts at Al-Mulk');
    expect(textOf('today-detail')).toBe('to Al-Mursalat · Juz 29 · Change');
    expect(drawn()).toEqual(['today-ring', 'today-summary', 'today-cta']);
    fireEvent.press(screen.getByTestId('today-summary'));
    expect(props.onJump).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('today-cta'));
    expect(props.onPrimary).toHaveBeenCalled();
    // The ring is a picture; the lines carry the count for VoiceOver.
    expect(screen.queryByTestId('today-ring')).toBeNull();
    expect(screen.getByTestId('today-summary').props.accessibilityLabel).toMatch(/20 pages/);
  });

  it('part done: how many of how many, filling; done: a check, "Done for today", and the next day under the button', async () => {
    ring('partial', range(562, 581), range(562, 567));
    await act(async () => {});
    expect(textOf('today-ring-count')).toBe('6');
    expect(textOf('today-ring-label')).toBe('of 20 pages');
    expect(screen.queryByTestId('today-ring-arc', HIDDEN)).not.toBeNull();
    expect(textOf('today-detail')).toBe('Juz 29 · Change');
    screen.unmount();

    ring('completed', range(562, 581), range(562, 581), { ahead: { lead: 'Tomorrow', first: 582 }, onAhead: jest.fn() });
    await act(async () => {});
    expect(screen.queryByTestId('today-ring-check', HIDDEN)).not.toBeNull();
    expect(textOf('today-ring-label')).toBe('20 pages');
    expect(textOf('today-title')).toBe('Done for today');
    expect(screen.queryByTestId('today-change')).toBeNull();
    expect(drawn()).toEqual(['today-ring', 'today-summary', 'today-cta', 'today-ahead']);
  });

  it('missed yesterday: the catch-up a quiet line under the button, held "Add to today"', async () => {
    const props = ring('not_started', range(562, 581), [], { catchUp: { title: 'Missed yesterday · Juz 28', label: 'Missed yesterday · Juz 28' } });
    await act(async () => {});
    expect(drawn()).toEqual(['today-ring', 'today-summary', 'today-cta', 'today-carry-over']);
    expect(textOf('today-add')).toBe('Add to today');
    fireEvent.press(screen.getByTestId('today-carry-over'));
    expect(props.onCarryOver).toHaveBeenCalled();
  });

  it('a rest day and nothing memorized: a dashed ring, "Rest" or "Start here", no Change', async () => {
    ring('not_started', [], [], { ahead: { lead: 'Tomorrow', first: 562 } }, { memorized: true, next: { lead: 'Tomorrow', first: 562 } });
    await act(async () => {});
    expect(screen.queryByTestId('today-ring-dashed', HIDDEN)).not.toBeNull();
    expect(textOf('today-ring-label')).toBe('Rest');
    expect(textOf('today-title')).toBe('Rest day');
    expect(screen.queryByTestId('today-change')).toBeNull();
    expect(screen.queryByTestId('today-ahead')).toBeNull();
    screen.unmount();

    ring('not_started', [], [], {}, { memorized: false });
    await act(async () => {});
    expect(textOf('today-ring-label')).toBe('Start here');
    expect(textOf('today-title')).toBe('Nothing to revise yet');
  });

  it('ringState reads the lines: rest, empty, done, partial, todo', () => {
    const at = (status: TodayStatus, pages: number[], done: number[], rest?: Parameters<typeof todayLines>[7]) =>
      ringState(todayLines(status, pages, new Set(done), 0, 0, undefined, 0, rest), status, new Set(done));
    expect(at('not_started', [], [], { memorized: true })).toEqual({ kind: 'rest' });
    expect(at('not_started', [], [])).toEqual({ kind: 'empty' });
    expect(at('completed', range(1, 5), range(1, 5))).toEqual({ kind: 'done', pages: 5 });
    expect(at('partial', range(1, 5), [1, 2])).toEqual({ kind: 'partial', done: 2, total: 5 });
    expect(at('not_started', range(1, 5), [])).toEqual({ kind: 'todo', total: 5 });
  });
});
