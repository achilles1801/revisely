// Sign-in B (Revisely Dev; BEHAVIOUR.md AUTH-3–5): the real RootNavigator, AuthNavigator and AuthProvider, with the Auth
// emulator answering. Board: ~/Documents/revisely-auth-mocks/v2/png/B1–B6.
import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { createAccountPartWay } from '../harness/admin';
import { Booted, newEmail, OpenApp, PASSWORD, Phone } from '../harness/phone';

/** Pass to Phone.open: the app as it starts with sign-in B on, RootNavigator deciding what shows. */
function withSignInB(mods: Booted): ReactElement {
  mods.require<any>('src/lib/release/signInB').setSignInBForTests(true);
  const { RootNavigator } = mods.require<any>('src/navigation/RootNavigator');
  return mods.React.createElement(RootNavigator);
}

const NETWORK_ERROR = 'Network error. Please check your connection';

/** Sign-in B's screens, as the user sees them. */
class SignInB {
  spinnerShown = false;

  constructor(private readonly app: OpenApp) {}

  private get screen() {
    return this.app.screen;
  }

  has(id: string): boolean {
    return this.screen.queryByTestId(id) != null;
  }

  text(id: string): string {
    const walk = (n: any): string => (typeof n === 'string' ? n : (n?.children ?? []).map(walk).join(''));
    return walk(this.screen.getByTestId(id));
  }

  value(id: string): string {
    return this.screen.getByTestId(id).props.value;
  }

  colour(id: string): string | undefined {
    const flat = (s: unknown): Record<string, any> => Object.assign({}, ...[s].flat(10).filter(Boolean));
    return flat(this.screen.getByTestId(id).props.style).color ?? flat(this.screen.getByTestId(id).props.style).borderColor;
  }

  async press(id: string): Promise<void> {
    await this.app.act(async () => this.app.mods.rtl.fireEvent.press(this.screen.getByTestId(id)));
  }

  type(id: string, text: string): void {
    this.app.mods.rtl.fireEvent.changeText(this.screen.getByTestId(id), text);
  }

  private error(): string | null {
    return this.has('email-error-text') ? this.text('email-error-text') : null;
  }

  private busy(): boolean {
    return this.screen.queryByTestId('email-submit')?.props.accessibilityState?.busy === true;
  }

  /** Presses the page's button and waits for the attempt to end: an error, or signed in (the page gone). */
  async submit(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      await this.press('email-submit');
      if (this.has('root-loading')) this.spinnerShown = true;
      await this.app.until(() => {
        if (this.has('root-loading')) this.spinnerShown = true;
        return !this.has('email-page') || (!this.busy() && this.error() != null);
      }, 'the attempt to end');
      // The emulator sometimes drops a request on a busy runner (harness/authRetry): pressed again.
      if (attempt >= 4 || !this.has('email-page') || this.error() !== NETWORK_ERROR) return;
    }
  }
}

it('[AUTH-3] [AUTH-4] the welcome, then email: an email already used, Sign in instead, a wrong password, then in', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-28 12:00');
  const email = newEmail('b-taken');
  createAccountPartWay(email, PASSWORD, 604);

  const phone = new Phone('phone');
  const app = await phone.open(withSignInB);
  try {
    await app.until(() => app.screen.queryByTestId('signin-welcome') != null, 'sign-in’s welcome');
    const b = new SignInB(app);
    expect(b.text('signin-slogan')).toBe('Even one verse counts.');
    expect(b.has('signin-google')).toBe(true);
    expect(b.has('signin-email')).toBe(true);

    // Create, with an address that already has an account: the board's words, and everything typed stays.
    await b.press('signin-email');
    await app.until(() => b.has('email-page'), 'the email page');
    expect(b.text('email-title')).toBe('Create your account');
    b.type('field-name', 'Maryam');
    b.type('field-email', email);
    b.type('field-password', 'another-password');
    await b.submit();
    expect(b.text('email-error-text')).toBe('This email already has an account. Sign in instead');
    expect(b.value('field-name')).toBe('Maryam');
    expect(b.value('field-password')).toBe('another-password');

    // Sign in instead: signing in, the email and password still typed. The wrong password says so.
    await b.press('email-error-action');
    expect(b.text('email-title')).toBe('Sign in with email');
    expect(b.value('field-email')).toBe(email);
    expect(b.value('field-password')).toBe('another-password');
    await b.submit();
    expect(b.text('email-error-text')).toBe('That password doesn’t match this email. Forgot password?');
    expect(b.value('field-email')).toBe(email);
    expect(b.has('email-page')).toBe(true);

    // No attempt took the page away (ACCOUNT-2).
    expect(b.spinnerShown).toBe(false);
    expect(app.auth.firebaseUser).toBeNull();

    // The right password: signed in.
    b.type('field-password', PASSWORD);
    await b.submit();
    expect(b.has('email-page')).toBe(false);
    expect(app.auth.firebaseUser?.email).toBe(email);
  } finally {
    await app.close();
  }
});

it('[AUTH-4] a new account from the email page goes on to onboarding', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-28 12:00');
  const email = newEmail('b-new');
  const phone = new Phone('phone');
  const app = await phone.open(withSignInB);
  try {
    await app.until(() => app.screen.queryByTestId('signin-welcome') != null, 'sign-in’s welcome');
    const b = new SignInB(app);
    await b.press('signin-email');
    await app.until(() => b.has('email-page'), 'the email page');
    b.type('field-name', 'Yusuf');
    b.type('field-email', email);
    b.type('field-password', 'short');
    await b.press('email-submit');
    expect(b.text('email-error-text')).toBe('Use at least 8 characters.');
    expect(app.auth.firebaseUser).toBeNull();
    b.type('field-password', PASSWORD);
    await b.submit();
    expect(b.has('email-page')).toBe(false);
    expect(app.auth.firebaseUser?.email).toBe(email);
    await app.untilLoaded();
    expect(app.app.onboardingComplete).toBe(false);
  } finally {
    await app.close();
  }
});

it('[AUTH-5] Forgot password? sends the reset email to the address typed, and says so', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-28 12:00');
  const email = newEmail('b-reset');
  createAccountPartWay(email, PASSWORD, 604);
  const phone = new Phone('phone');
  const app = await phone.open(withSignInB);
  try {
    await app.until(() => app.screen.queryByTestId('signin-welcome') != null, 'sign-in’s welcome');
    const b = new SignInB(app);
    await b.press('signin-email');
    await app.until(() => b.has('email-page'), 'the email page');
    await b.press('email-switch');
    b.type('field-email', email);
    await b.press('email-forgot');
    await app.until(() => b.has('reset-email'), 'the reset sheet');
    expect(b.value('reset-email')).toBe(email);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await b.press('reset-send');
      await app.until(() => b.has('reset-sent') || b.has('reset-error'), 'the reset to answer');
      if (b.has('reset-sent')) break;
    }
    expect(b.text('reset-sent')).toContain(email);
    await b.press('reset-done');
    expect(b.value('field-email')).toBe(email);
  } finally {
    await app.close();
  }
});
