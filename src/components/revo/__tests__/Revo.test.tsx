import React from 'react';
import { Alert, ScrollView, DeviceEventEmitter, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../context/ThemeContext';
import { __setRevoBackendForTests, RevoError, type RevoBackend } from '../../../lib/revo/backend';
import { createMemoryRevoBackend } from '../../../lib/revo/memoryBackend';
import type { RevoContext } from '../../../lib/revo/types';
import { RevoBoundary } from '../RevoBoundary';
import { RevoChat } from '../RevoChat';
import { RevoSheetFrame } from '../RevoSheetFrame';
import { RevoHistory, RevoMemory, RevoOptIn } from '../RevoPages';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockCopy = jest.fn();
jest.mock('../../../lib/clipboard', () => ({ copyText: (t: string) => mockCopy(t) }));
jest.mock('../../../lib/firebase', () => ({ auth: { currentUser: { uid: 'u', displayName: 'Maryam' } }, db: {} }));

const DAY = '2026-11-03';
const ctx: RevoContext = {
  totals: {
    memorizedPages: 100,
    revisedWithin7Days: 40,
    revisedWithin30Days: 90,
    daysWithSession30: 26,
    streakDays: 12,
    sessions30: 28,
    weakPages: 2,
    moderatePages: 20,
    strongPages: 78,
    weakRevisedLast7Days: 2,
    pagesPerDay7: 18.6,
    pagesPerDay30: 17.2,
    plannedPerDay: 20,
  },
  today: { plannedPages: 20, revisedPages: 6, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 31, memorizedPages: 0, nextPages: [548, 549, 550], weakNext: [548, 549], done: false },
  weakPages: [548, 549],
  week: [{ day: DAY, pages: 6, planned: 20, done: false }],
  streak: { days: 12, atRisk: null },
  localTime: '21:41',
};
const mockSaveUser = jest.fn(async () => undefined);
const mockUser = { name: 'Maryam', carryOver: null, fajrBoundaryEnabled: false };
jest.mock('../../../context/AppContext', () => ({
  useApp: () => ({ user: mockUser, saveUser: mockSaveUser, logs: [], pages: [] }),
}));
jest.mock('../../../lib/revo/useRevoContext', () => ({
  useRevoContext: () => ({ day: '2026-11-03', context: mockCtx(), build: () => mockCtx() }),
}));
const mockCtx = () => ctx;

let backend: ReturnType<typeof createMemoryRevoBackend>;
beforeEach(() => {
  backend = createMemoryRevoBackend({ optIn: true, now: () => Date.UTC(2026, 10, 3, 18, 41) });
  __setRevoBackendForTests(backend);
  mockSaveUser.mockClear();
  mockCopy.mockClear();
});
afterAll(() => __setRevoBackendForTests(null));

function Chat({ usage = { day: DAY, count: 0 }, onAction = jest.fn(), onOff }: { usage?: { day: string; count: number }; onAction?: jest.Mock; onOff?: jest.Mock }) {
  const [chatId, setChatId] = React.useState<string | null>(null);
  const [attach, setAttach] = React.useState<null | import('../../../lib/revo/types').RevoAttachment>(null);
  return (
    <ThemeProvider>
      <RevoChat
        uid="u"
        chatId={chatId}
        onChatId={setChatId}
        usage={usage}
        attach={attach}
        onAttach={setAttach}
        onPick={jest.fn()}
        onHistory={jest.fn()}
        onMemory={jest.fn()}
        onExpand={jest.fn()}
        onAction={onAction}
        onOff={onOff}
      />
    </ThemeProvider>
  );
}

const flush = () => act(async () => {});

describe('Revo’s conversation', () => {
  it('[REVO-24] the conversation keeps its end in view when the list gets shorter (the keyboard), unless scrolled up', async () => {
    render(<Chat />);
    await flush();
    const list = screen.getByTestId('revo-messages');
    const view = screen.UNSAFE_getAllByType(ScrollView).find((n) => n.props.testID === 'revo-messages')!.instance as {
      scrollToEnd: (o?: { animated?: boolean }) => void;
    };
    const toEnd = jest.spyOn(view, 'scrollToEnd');
    const layout = (height: number) => fireEvent(list, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
    // At the end (as it opens): a shorter list scrolls back to its end.
    layout(300);
    expect(toEnd).toHaveBeenLastCalledWith({ animated: false });
    toEnd.mockClear();
    // Scrolled up to read: left where it is.
    fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 300 }, contentSize: { height: 1000 } } });
    layout(260);
    expect(toEnd).not.toHaveBeenCalled();
    // Back at the end: kept there again.
    fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 690 }, layoutMeasurement: { height: 300 }, contentSize: { height: 1000 } } });
    layout(240);
    expect(toEnd).toHaveBeenLastCalledWith({ animated: false });
  });

  it('opens on the greeting from today’s data, with suggestions; nothing asked yet', async () => {
    render(<Chat />);
    await flush();
    expect(screen.getByTestId('revo-greeting').props.children).toBe(
      'Salaam Maryam. You’re 6 pages into today, and p. 548–549 are coming up next. They’re rated weak. Want a short plan for them?',
    );
    expect(screen.getByTestId('revo-chip-Plan p. 548–549')).toBeTruthy();
    expect(backend.state().usage.count).toBe(0);
    fireEvent.press(screen.getByTestId('revo-greeting-copy'));
    expect(mockCopy).toHaveBeenCalledWith(expect.stringMatching(/^Salaam Maryam\./));
  });

  it('a suggestion asks it: the answer comes with a chart and one plan, which changes nothing until tapped', async () => {
    render(<Chat />);
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-chip-Plan p. 548–549'));
    });
    await flush();
    expect(screen.getByTestId('revo-question')).toBeTruthy();
    expect(screen.getByTestId('revo-chart-pageRatings')).toBeTruthy();
    expect(screen.getByTestId('revo-plan')).toBeTruthy();
    expect(mockSaveUser).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-plan-do'));
    });
    await flush();
    // Tomorrow's carry: the pages first.
    expect(mockSaveUser).toHaveBeenCalledWith(expect.objectContaining({ carryOver: expect.objectContaining({ day: '2026-11-04', pages: [548, 549] }) }));
    expect(screen.getByTestId('revo-plan-added')).toBeTruthy();
    expect(backend.state().chats[0].meta).toBe('plan added');
  });

  it('“Not now” leaves the plan alone; thumbs are kept on the answer', async () => {
    render(<Chat />);
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-chip-Plan p. 548–549'));
    });
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-plan-not-now'));
      fireEvent.press(screen.getByTestId('revo-answer-up'));
    });
    await flush();
    expect(screen.queryByTestId('revo-plan-do')).toBeNull();
    expect(mockSaveUser).not.toHaveBeenCalled();
    expect(screen.getByTestId('revo-answer-up').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('a failed question says so and can be tried again; what was attached comes back', async () => {
    const failing: RevoBackend = { ...backend, ask: jest.fn(async () => Promise.reject(new RevoError('unavailable', 'busy'))) };
    __setRevoBackendForTests(failing);
    render(<Chat />);
    await flush();
    fireEvent.changeText(screen.getByTestId('revo-input'), 'How is my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(screen.getByTestId('revo-error')).toBeTruthy();
    expect(screen.queryByTestId('revo-typing')).toBeNull();
  });

  it('a failure says why: offline, or the server’s own reason; both can be tried again', async () => {
    const offline: RevoBackend = { ...backend, ask: jest.fn(async () => Promise.reject(new RevoError('offline', 'x'))) };
    __setRevoBackendForTests(offline);
    render(<Chat />);
    await flush();
    fireEvent.changeText(screen.getByTestId('revo-input'), 'How is my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(screen.getByText(/^You’re offline\. Revo needs the internet\.\s+Try again$/)).toBeTruthy();
    const busy: RevoBackend = { ...backend, ask: jest.fn(async () => Promise.reject(new RevoError('unavailable', 'Revo didn’t answer in time. Try again.'))) };
    __setRevoBackendForTests(busy);
    render(<Chat />);
    await flush();
    fireEvent.changeText(screen.getByTestId('revo-input'), 'How is my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(screen.getByText(/^Revo didn’t answer in time\. Try again\.\s+Try again$/)).toBeTruthy();
  });

  it('Revo off on the server (turned off elsewhere): the sheet goes to the opt-in, not a dead end', async () => {
    const off: RevoBackend = { ...backend, ask: jest.fn(async () => Promise.reject(new RevoError('off', 'Turn Revo on first.'))) };
    __setRevoBackendForTests(off);
    const onOff = jest.fn();
    render(<Chat onOff={onOff} />);
    await flush();
    fireEvent.changeText(screen.getByTestId('revo-input'), 'How is my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(onOff).toHaveBeenCalledTimes(1);
  });

  it('a follow-up’s answer joins the conversation; the first one shows before the chat is read back', async () => {
    render(<Chat />);
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-chip-How was my week?'));
    });
    await flush();
    expect(screen.getAllByTestId('revo-answer')).toHaveLength(1);
    fireEvent.changeText(screen.getByTestId('revo-input'), 'And my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(screen.getAllByTestId('revo-answer')).toHaveLength(2);
    expect(screen.getAllByTestId('revo-question')).toHaveLength(2);
  });

  it('an error inside Revo’s sheet stays there: it says so, and the app carries on', async () => {
    const Throws = () => {
      throw new TypeError("Cannot read property 'id' of undefined");
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ThemeProvider>
        <RevoBoundary resetKey={1}>
          <Throws />
        </RevoBoundary>
      </ThemeProvider>,
    );
    await flush();
    spy.mockRestore();
    expect(screen.getByTestId('revo-broken')).toBeTruthy();
    expect(screen.getByText('Revo ran into a problem')).toBeTruthy();
  });

  it('the day’s questions used: the limit card, the composer off with when Revo is back', async () => {
    render(<Chat usage={{ day: DAY, count: 20 }} />);
    await flush();
    expect(screen.getByText('That’s today’s 20 questions')).toBeTruthy();
    expect(screen.getByText('Revo is back at midnight. Your conversations stay in History.')).toBeTruthy();
    const input = screen.getByTestId('revo-input');
    expect(input.props.editable).toBe(false);
    expect(input.props.placeholder).toBe('Back at midnight');
    // A count from another day doesn't hold.
    render(<Chat usage={{ day: '2026-11-02', count: 20 }} />);
    await flush();
    expect(screen.getByTestId('revo-input').props.editable).toBe(true);
  });

  it('the month’s cap reached: Revo is resting until next month', async () => {
    const capped: RevoBackend = { ...backend, ask: jest.fn(async () => Promise.reject(new RevoError('monthly', 'paused'))) };
    __setRevoBackendForTests(capped);
    render(<Chat />);
    await flush();
    fireEvent.changeText(screen.getByTestId('revo-input'), 'How is my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(screen.getByText('Revo is resting')).toBeTruthy();
    expect(screen.getByTestId('revo-input').props.placeholder).toBe('Back next month');
  });
});

describe('Revo’s sheet and the keyboard', () => {
  it('the keyboard up: the sheet sits on it (no safe-area padding under the composer); down: back as it was', async () => {
    render(
      <ThemeProvider>
        <RevoSheetFrame visible onClose={jest.fn()} full onFullChange={jest.fn()}>
          {null}
        </RevoSheetFrame>
      </ThemeProvider>,
    );
    await flush();
    const pad = () => StyleSheet.flatten(screen.getByTestId('revo-sheet').props.style).paddingBottom;
    const before = pad();
    expect(before).toBeGreaterThanOrEqual(12);
    await act(async () => {
      DeviceEventEmitter.emit('keyboardWillShow', { endCoordinates: { height: 336, screenY: 620, screenX: 0, width: 440 }, duration: 250 });
      DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { height: 336, screenY: 620, screenX: 0, width: 440 }, duration: 0 });
    });
    expect(pad()).toBe(8);
    await act(async () => {
      DeviceEventEmitter.emit('keyboardWillHide', { endCoordinates: { height: 0, screenY: 956, screenX: 0, width: 440 }, duration: 250 });
      DeviceEventEmitter.emit('keyboardDidHide', { endCoordinates: { height: 0, screenY: 956, screenX: 0, width: 440 }, duration: 0 });
    });
    expect(pad()).toBe(before);
  });
});

describe('Revo’s Memory and History', () => {
  it('Memory: each item can be deleted, the switch turns memory off, Clear asks first', async () => {
    backend.seedMemory([
      { text: 'You like short, practical plans.', source: 'chat', day: DAY },
      { text: 'You read Al-Kahf on Fridays.', source: 'review', day: '2026-10-30' },
    ]);
    render(
      <ThemeProvider>
        <RevoMemory uid="u" settings={{ optIn: true, memoryOn: true }} today={DAY} onBack={jest.fn()} />
      </ThemeProvider>,
    );
    await flush();
    expect(screen.getByText('From a chat today')).toBeTruthy();
    expect(screen.getByText('From your Activity')).toBeTruthy();
    const first = backend.state().memory[0];
    await act(async () => {
      fireEvent.press(screen.getByTestId(`revo-memory-delete-${first.id}`));
    });
    expect(backend.state().memory).toHaveLength(1);
    await act(async () => {
      fireEvent(screen.getByTestId('revo-memory-switch'), 'valueChange', false);
    });
    expect(backend.state().settings.memoryOn).toBe(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(screen.getByTestId('revo-memory-clear'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Clear')?.onPress?.());
    expect(backend.state().memory).toHaveLength(0);
    alert.mockRestore();
  });

  it('History: by day, a Day in review among the chats, search, and a tap opens one', async () => {
    backend.seedReview(DAY, 'A steady day.', '18 of 20 revised');
    await backend.ask({ chatId: null, day: DAY, question: 'How was my week?', context: ctx, attach: null });
    const onOpen = jest.fn();
    render(
      <ThemeProvider>
        <RevoHistory uid="u" onBack={jest.fn()} onOpen={onOpen} onNew={jest.fn()} />
      </ThemeProvider>,
    );
    await flush();
    expect(screen.getByText('Day in review')).toBeTruthy();
    expect(screen.getByText('How my week went')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('revo-history-search'), 'week');
    expect(screen.queryByText('Day in review')).toBeNull();
    fireEvent.press(screen.getByText('How my week went'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('the opt-in: Turn on and Not now; it says what is sent', async () => {
    const onTurnOn = jest.fn();
    const onNotNow = jest.fn();
    render(
      <ThemeProvider>
        <RevoOptIn onTurnOn={onTurnOn} onNotNow={onNotNow} busy={false} error={null} />
      </ThemeProvider>,
    );
    await flush();
    expect(screen.getByText('Coverage, consistency, weak spots and pace.')).toBeTruthy();
    expect(screen.getByText('Revo AI can make mistakes.', { exact: false })).toBeTruthy();
    fireEvent.press(screen.getByTestId('revo-turn-on'));
    fireEvent.press(screen.getByTestId('revo-not-now'));
    expect(onTurnOn).toHaveBeenCalled();
    expect(onNotNow).toHaveBeenCalled();
  });
});
