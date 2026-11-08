import React from 'react';
import { Alert, ScrollView, DeviceEventEmitter, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../context/ThemeContext';
import { __setRevoBackendForTests, RevoError, type RevoBackend } from '../../../lib/revo/backend';
import { plainText } from '../../../lib/passages';
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
const mockRefreshRelease = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('../../../lib/revo/release', () => ({ ...jest.requireActual('../../../lib/revo/release'), refreshRevoRelease: (...a: unknown[]) => mockRefreshRelease(...a) }));

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
  passages: {},
  pageNames: {},
  localTime: '21:41',
};
const mockSaveUser = jest.fn(async () => undefined);
const mockUser = { name: 'Maryam', carryOver: null, fajrBoundaryEnabled: false, smartTrackingEnabled: true };
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

function Chat({
  usage = { day: DAY, count: 0 },
  onAction = jest.fn(),
  onOff,
  attached = [],
  review = null,
  onOpenReview,
  opening = null,
}: {
  usage?: { day: string; count: number };
  onAction?: jest.Mock;
  onOff?: jest.Mock;
  attached?: import('../../../lib/revo/types').RevoAttachment[];
  review?: { at: number } | null;
  onOpenReview?: jest.Mock;
  opening?: import('../../../lib/revo/greeting').GreetingOpens | null;
}) {
  const [chatId, setChatId] = React.useState<string | null>(null);
  const [attachments, setAttachments] = React.useState(attached);
  return (
    <ThemeProvider>
      <RevoChat
        uid="u"
        chatId={chatId}
        onChatId={setChatId}
        usage={usage}
        attachments={attachments}
        onAttachments={setAttachments}
        onAdd={jest.fn()}
        onHistory={jest.fn()}
        onMemory={jest.fn()}
        onExpand={jest.fn()}
        onAction={onAction}
        onOff={onOff}
        review={review}
        onOpenReview={onOpenReview}
        opening={opening}
      />
    </ThemeProvider>
  );
}

const flush = () => act(async () => {});

describe('Revo’s conversation', () => {
  it('[REVO-34] a new conversation offers today’s Day in review as a row under the greeting, never as what it opens on; a tap opens it', async () => {
    const onOpenReview = jest.fn();
    const at = new Date(2026, 10, 3, 20, 5).getTime();
    const { rerender } = render(<Chat review={{ at }} onOpenReview={onOpenReview} />);
    await flush();
    expect(screen.getByTestId('revo-greeting')).toBeTruthy();
    const row = screen.getByTestId('revo-review');
    expect(row.props.accessibilityLabel).toBe(`Day in review, ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    fireEvent.press(row);
    expect(onOpenReview).toHaveBeenCalledTimes(1);
    // Opened (or none today): no row.
    rerender(<Chat />);
    await flush();
    expect(screen.queryByTestId('revo-review')).toBeNull();
  });

  it('[REVO-35] the open counted on the phone picks the greeting: a second open in the same state says something else; a stale count (another state or day) doesn’t', async () => {
    render(<Chat opening={{ day: DAY, state: 'todo:6', n: 1 }} />);
    await flush();
    expect(plainText(String(screen.getByTestId('revo-greeting').props.children))).toBe(
      'Salaam Maryam. You’re 6 pages into today, and Al-Hashr 17 to Al-Mumtahanah 5 is next. This week you’ve revised 6 pages on 1 day.',
    );
    screen.unmount();
    render(<Chat opening={{ day: DAY, state: 'todo:2', n: 3 }} />);
    await flush();
    expect(plainText(String(screen.getByTestId('revo-greeting').props.children))).toMatch(/It’s rated weak\. Want a short plan for it\?$/);
  });

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
    expect(plainText(String(screen.getByTestId('revo-greeting').props.children))).toBe(
      'Salaam Maryam. You’re 6 pages into today, and Al-Hashr 17 to Al-Mumtahanah 5 is next. It’s rated weak. Want a short plan for it?',
    );
    expect(screen.getByTestId('revo-chip-Plan Al-Hashr to Al-Mumtahanah')).toBeTruthy();
    expect(backend.state().usage.count).toBe(0);
    fireEvent.press(screen.getByTestId('revo-greeting-copy'));
    expect(mockCopy).toHaveBeenCalledWith(expect.stringMatching(/^Salaam Maryam\./));
  });

  it('[REVO-36] with Smart Tracking off, a ratings chart isn’t drawn: the answer and its plan still are', async () => {
    mockUser.smartTrackingEnabled = false;
    try {
      render(<Chat />);
      await flush();
      await act(async () => {
        fireEvent.press(screen.getByTestId('revo-chip-Plan Al-Hashr to Al-Mumtahanah'));
      });
      await flush();
      expect(screen.getByTestId('revo-plan')).toBeTruthy();
      expect(screen.queryByTestId('revo-chart-pageRatings')).toBeNull();
    } finally {
      mockUser.smartTrackingEnabled = true;
    }
  });

  it('a suggestion asks it: the answer comes with a chart and one plan, which changes nothing until tapped', async () => {
    render(<Chat />);
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-chip-Plan Al-Hashr to Al-Mumtahanah'));
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
      fireEvent.press(screen.getByTestId('revo-chip-Plan Al-Hashr to Al-Mumtahanah'));
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

  it('[REVO-33] several things attached go as `attachments`, each a chip on the question; one goes as `attach`', async () => {
    const ask = jest.fn(backend.ask);
    __setRevoBackendForTests({ ...backend, ask });
    const juz = { kind: 'insight', label: 'Weak spots', insight: 'weakSpots' } as const;
    const pace = { kind: 'insight', label: 'Pace', insight: 'pace' } as const;
    render(<Chat attached={[juz, pace]} />);
    await flush();
    expect(screen.getAllByTestId('revo-context-chip')).toHaveLength(2);
    fireEvent.changeText(screen.getByTestId('revo-input'), 'What about these?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(ask.mock.calls[0][0]).toMatchObject({ attach: null, attachments: [juz, pace] });
    // Sent: the composer is empty again.
    expect(screen.queryAllByTestId('revo-context-remove')).toHaveLength(0);
    render(<Chat attached={[juz]} />);
    await flush();
    fireEvent.changeText(screen.getAllByTestId('revo-input').at(-1)!, 'And this?');
    await act(async () => {
      fireEvent.press(screen.getAllByTestId('revo-send').at(-1)!);
    });
    await flush();
    expect(ask.mock.calls[1][0]).toMatchObject({ attach: juz });
    expect(ask.mock.calls[1][0]).not.toHaveProperty('attachments');
  });

  it('a chip’s × takes that one away, and a failed question brings them all back', async () => {
    __setRevoBackendForTests({ ...backend, ask: jest.fn(async () => Promise.reject(new RevoError('unavailable', 'busy'))) });
    const a = { kind: 'insight', label: 'Weak spots', insight: 'weakSpots' } as const;
    const b = { kind: 'insight', label: 'Pace', insight: 'pace' } as const;
    const c = { kind: 'insight', label: 'Coverage', insight: 'coverage' } as const;
    render(<Chat attached={[a, b, c]} />);
    await flush();
    fireEvent.press(screen.getAllByTestId('revo-context-remove')[1]);
    expect(screen.getAllByTestId('revo-context-chip').map((x) => x.props.children)).toHaveLength(2);
    expect(screen.queryByText('Pace')).toBeNull();
    fireEvent.changeText(screen.getByTestId('revo-input'), 'How is my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(screen.getByText('Weak spots')).toBeTruthy();
    expect(screen.getByText('Coverage')).toBeTruthy();
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

  it('[REVO-4] the day’s share of the cap reached: Revo is resting, with when it is back in the server’s words', async () => {
    const msg = 'Revo has reached today’s limit for everyone. It’s back in about 6 hours.';
    __setRevoBackendForTests({ ...backend, ask: jest.fn(async () => Promise.reject(new RevoError('resting', msg))) });
    render(<Chat />);
    await flush();
    fireEvent.changeText(screen.getByTestId('revo-input'), 'How is my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(screen.getByText('Revo is resting')).toBeTruthy();
    expect(screen.getByText(`${msg} Your conversations stay in History.`)).toBeTruthy();
    expect(screen.getByTestId('revo-input').props.placeholder).toBe('Back later');
  });

  it('[REVO-37] Revo paused for everyone: the sheet says so and stays, never the opt-in', async () => {
    __setRevoBackendForTests({ ...backend, ask: jest.fn(async () => Promise.reject(new RevoError('paused', 'Revo is paused for now. Try again later.'))) });
    const onOff = jest.fn();
    render(<Chat onOff={onOff} />);
    await flush();
    fireEvent.changeText(screen.getByTestId('revo-input'), 'How is my pace?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('revo-send'));
    });
    await flush();
    expect(screen.getByTestId('revo-error')).toHaveTextContent('Revo is paused for now. Try again later.');
    expect(onOff).not.toHaveBeenCalled();
    // The switch is read again at once, so the button goes.
    expect(mockRefreshRelease).toHaveBeenCalledWith(true);
  });
});

describe('Revo’s sheet and the keyboard', () => {
  it('on Android its window is drawn under the system bars, as the app is, so a full sheet reaches up under the status bar', async () => {
    render(
      <ThemeProvider>
        <RevoSheetFrame visible onClose={jest.fn()} full onFullChange={jest.fn()}>
          {null}
        </RevoSheetFrame>
      </ThemeProvider>,
    );
    await flush();
    const { Modal } = jest.requireActual<typeof import('react-native')>('react-native');
    expect(screen.UNSAFE_getByType(Modal).props).toMatchObject({ statusBarTranslucent: true, navigationBarTranslucent: true });
  });

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
