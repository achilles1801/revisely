// LINK-1: a web link opens in the in-app browser, else the phone's browser, else its address shows with Copy.
import { Alert, Linking } from 'react-native';
import { openEmail, openWebPage, resetOpenWebPageForTests } from '../openWebPage';

const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args) }));
const mockCopy = jest.fn();
jest.mock('../clipboard', () => ({ copyText: (text: string) => mockCopy(text) }));
const mockError = jest.fn();
jest.mock('../logger', () => ({ logger: { error: (...args: unknown[]) => mockError(...args), warn: jest.fn(), log: jest.fn() } }));

const PRIVACY = 'https://revisely.app/privacy/';
type Button = { text: string; onPress?: () => void; style?: string };

let alert: jest.SpyInstance;
let openURL: jest.SpyInstance;

beforeEach(() => {
  resetOpenWebPageForTests();
  mockOpenBrowser.mockReset();
  mockCopy.mockReset();
  mockError.mockReset();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  alert.mockRestore();
  openURL.mockRestore();
});

function shownButtons(): Button[] {
  return alert.mock.calls[0][2] as Button[];
}

describe('openWebPage', () => {
  it('opens the page in the in-app browser, and only there', async () => {
    mockOpenBrowser.mockResolvedValue({ type: 'opened' });
    await expect(openWebPage(PRIVACY)).resolves.toBe('in-app');
    expect(mockOpenBrowser).toHaveBeenCalledWith(PRIVACY);
    expect(openURL).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('closed by the user (iOS answers when the page goes) is still the in-app browser', async () => {
    mockOpenBrowser.mockResolvedValue({ type: 'cancel' });
    await expect(openWebPage(PRIVACY)).resolves.toBe('in-app');
    expect(openURL).not.toHaveBeenCalled();
  });

  it('when the in-app browser fails, the phone’s browser opens it', async () => {
    mockOpenBrowser.mockRejectedValue(Object.assign(new Error('No matching browser activity found'), { code: 'ERR_NO_MATCHING_ACTIVITY' }));
    await expect(openWebPage(PRIVACY)).resolves.toBe('browser');
    expect(openURL).toHaveBeenCalledWith(PRIVACY);
    expect(alert).not.toHaveBeenCalled();
  });

  it('a stuck "locked" in-app browser (an earlier page never came up) goes to the phone’s browser', async () => {
    mockOpenBrowser.mockResolvedValue({ type: 'locked' });
    await expect(openWebPage(PRIVACY)).resolves.toBe('browser');
    expect(openURL).toHaveBeenCalledWith(PRIVACY);
  });

  it('when neither opens it (App Review’s iPhone), the address shows with Copy, and nothing rejects', async () => {
    mockOpenBrowser.mockRejectedValue(new Error('boom'));
    openURL.mockRejectedValue(Object.assign(new Error(`Unable to open URL: ${PRIVACY}`), { code: 'EUNSPECIFIED' }));
    await expect(openWebPage(PRIVACY)).resolves.toBe('address');
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, body] = alert.mock.calls[0];
    expect(title).toBe('Couldn’t open the page');
    expect(body).toContain(PRIVACY);
    const buttons = shownButtons();
    expect(buttons.map((b) => b.text)).toEqual(['Copy', 'OK']);
    buttons[0].onPress?.();
    expect(mockCopy).toHaveBeenCalledWith(PRIVACY);
    // Reported once, by the errors' codes only: never the address (a support link carries a one-time code).
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockError.mock.calls[0])).not.toContain('revisely.app');
    expect(mockError.mock.calls[0][2]).toEqual({ inApp: 'Error', browser: 'EUNSPECIFIED' });
  });

  it('a second tap on the same link while its page slides up opens nothing more', async () => {
    let settle: (v: { type: string }) => void = () => undefined;
    mockOpenBrowser.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    const first = openWebPage(PRIVACY);
    await expect(openWebPage(PRIVACY)).resolves.toBe('already');
    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
    settle({ type: 'cancel' });
    await expect(first).resolves.toBe('in-app');
  });

  it('another link right after is a tap of its own', async () => {
    mockOpenBrowser.mockResolvedValue({ type: 'opened' });
    await openWebPage(PRIVACY);
    await expect(openWebPage('https://revisely.app/terms/')).resolves.toBe('in-app');
    expect(mockOpenBrowser).toHaveBeenCalledTimes(2);
  });
});

describe('openEmail', () => {
  it('hands the mailto link to the email app', async () => {
    await expect(openEmail('mailto:support@revisely.app?subject=Hi', 'support@revisely.app')).resolves.toBe('mail');
    expect(openURL).toHaveBeenCalledWith('mailto:support@revisely.app?subject=Hi');
    expect(alert).not.toHaveBeenCalled();
  });

  it('with no email app, shows the address with Copy', async () => {
    openURL.mockRejectedValue(new Error('Unable to open URL'));
    await expect(openEmail('mailto:support@revisely.app', 'support@revisely.app')).resolves.toBe('address');
    const [title, body] = alert.mock.calls[0];
    expect(title).toBe('Couldn’t open an email app');
    expect(body).toContain('support@revisely.app');
    shownButtons()[0].onPress?.();
    expect(mockCopy).toHaveBeenCalledWith('support@revisely.app');
  });
});
