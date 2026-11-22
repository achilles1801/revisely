// Settings → Share Revisely and Report a problem (BEHAVIOUR.md SET-1 to SET-3). The report form is the app's own
// (components/report), mounted once over the main screens; only Sentry, the outside service the report goes to, is
// stood in, at its SDK's edge.
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockSent: { feedback: any; hint: any }[] = [];
const mockScreen: { shots: any[] | null } = { shots: null };
jest.mock('@sentry/react-native', () => ({
  captureFeedback: (feedback: any, hint: any) => mockSent.push({ feedback, hint }),
  lastEventId: () => undefined,
  captureException: jest.fn(),
  setUser: jest.fn(),
  nativeCrash: jest.fn(),
}));
jest.mock('@sentry/react-native/dist/js/wrapper', () => ({
  NATIVE: { captureScreenshot: async () => mockScreen.shots },
}));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));

import { CAPTURE_DELAY_MS, ReportProblemHost } from '../../../src/components/report/ReportProblemHost';
import { getReportState, openReportProblem } from '../../../src/lib/report/state';
import { REVISELY_LINK, shareRevisely } from '../../../src/lib/shareApp';
import { en } from '../../../src/i18n/en';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
/** The form as MainNavigator mounts it. */
const host = () => render(
  <SafeAreaProvider initialMetrics={METRICS}>
    <ReportProblemHost />
  </SafeAreaProvider>,
);

const flush = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('Sharing Revisely (SET-1)', () => {
  it('[SET-1] the words and the link are each shared once, on an iPhone and on Android', () => {
    const words = en.settings.support.shareMessage;
    expect(words).not.toContain('revisely.app');
    expect(shareRevisely(words, 'ios')).toEqual({ message: words, url: REVISELY_LINK });
    const android = shareRevisely(words, 'android');
    expect(android.url).toBeUndefined();
    expect(android.message.split(REVISELY_LINK)).toHaveLength(2);
    expect(android.message.endsWith(REVISELY_LINK)).toBe(true);
  });
});

describe('Report a problem (SET-2, SET-3)', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    mockSent.length = 0;
    mockScreen.shots = null;
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => {
    alert.mockRestore();
    jest.useRealTimers();
  });

  it('[SET-2] Send needs words, sends them with no name or email, closes the form and says so', async () => {
    const screen = host();
    expect(screen.queryByTestId('report-sheet-input')).toBeNull();
    act(() => openReportProblem());
    expect(screen.getByText('Report a problem')).toBeTruthy();

    // Nothing typed, or only spaces: Send does nothing.
    fireEvent.press(screen.getByTestId('report-sheet-save'));
    fireEvent.changeText(screen.getByTestId('report-sheet-input'), '   ');
    fireEvent.press(screen.getByTestId('report-sheet-save'));
    expect(mockSent).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('report-sheet-input'), '  The page went blank after a search.  ');
    fireEvent.press(screen.getByTestId('report-sheet-save'));
    expect(mockSent).toHaveLength(1);
    expect(mockSent[0].feedback.message).toBe('The page went blank after a search.');
    expect(mockSent[0].feedback.name).toBeUndefined();
    expect(mockSent[0].feedback.email).toBeUndefined();
    expect(mockSent[0].hint).toBeUndefined();
    expect(alert).toHaveBeenCalledWith('Thank you', 'Your report was sent.');
    expect(getReportState().phase).toBe('closed');
    expect(getReportState().text).toBe('');
  });

  it('[SET-2] Cancel sends nothing and keeps nothing', () => {
    const screen = host();
    act(() => openReportProblem());
    fireEvent.changeText(screen.getByTestId('report-sheet-input'), 'Half a thought');
    fireEvent.press(screen.getByTestId('report-sheet-cancel'));
    expect(mockSent).toHaveLength(0);
    act(() => openReportProblem());
    expect(screen.getByTestId('report-sheet-input').props.value).toBe('');
  });

  it('[SET-3] a screenshot: the form steps aside, the bar captures the screen, and the report carries it', async () => {
    const data = new Uint8Array([1, 2, 3]);
    mockScreen.shots = [{ filename: 'screenshot.png', contentType: 'image/png', data }];
    const screen = host();
    act(() => openReportProblem());
    fireEvent.changeText(screen.getByTestId('report-sheet-input'), 'The highlight is on the wrong ayah.');
    fireEvent.press(screen.getByTestId('report-sheet-shot-add'));
    expect(getReportState().phase).toBe('capture');
    expect(screen.getByText('Capture this screen')).toBeTruthy();

    fireEvent.press(screen.getByTestId('report-capture'));
    // The bar has gone before the picture is taken.
    expect(screen.queryByTestId('report-capture-bar')).toBeNull();
    await flush(CAPTURE_DELAY_MS);
    expect(getReportState().phase).toBe('form');
    expect(screen.getByText('Screenshot added')).toBeTruthy();
    expect(screen.getByTestId('report-sheet-input').props.value).toBe('The highlight is on the wrong ayah.');

    fireEvent.press(screen.getByTestId('report-sheet-save'));
    expect(mockSent[0].feedback.message).toBe('The highlight is on the wrong ayah.');
    expect(mockSent[0].hint.attachments).toEqual([{ filename: 'screenshot.png', contentType: 'image/png', data }]);
  });

  it('[SET-3] ✕ and Remove leave the report without a picture; a failed capture says so and can still be sent', async () => {
    mockScreen.shots = [{ filename: 'screenshot.png', contentType: 'image/png', data: new Uint8Array([9]) }];
    const screen = host();
    act(() => openReportProblem());
    fireEvent.changeText(screen.getByTestId('report-sheet-input'), 'Words');

    // ✕ on the bar: back to the form, no picture.
    fireEvent.press(screen.getByTestId('report-sheet-shot-add'));
    fireEvent.press(screen.getByTestId('report-capture-cancel'));
    expect(getReportState().phase).toBe('form');
    expect(screen.queryByText('Screenshot added')).toBeNull();

    // Taken, then removed.
    fireEvent.press(screen.getByTestId('report-sheet-shot-add'));
    fireEvent.press(screen.getByTestId('report-capture'));
    await flush(CAPTURE_DELAY_MS);
    fireEvent.press(screen.getByTestId('report-sheet-shot-remove'));
    expect(screen.queryByText('Screenshot added')).toBeNull();

    // The phone can't take one.
    mockScreen.shots = null;
    fireEvent.press(screen.getByTestId('report-sheet-shot-add'));
    fireEvent.press(screen.getByTestId('report-capture'));
    await flush(CAPTURE_DELAY_MS);
    expect(screen.getByText('Couldn’t take a screenshot. Try again.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('report-sheet-save'));
    expect(mockSent).toHaveLength(1);
    expect(mockSent[0].hint).toBeUndefined();
  });
});
