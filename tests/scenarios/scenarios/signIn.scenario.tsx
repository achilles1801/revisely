// Signing up and signing in on the app's own sign-in screen (BEHAVIOUR.md
// ACCOUNT-2): the real RootNavigator, AuthScreen and AuthProvider, with the Auth
// emulator answering. A failed attempt used to swap the screen for the launch
// spinner and mount it again from scratch, so "already registered" or a wrong
// password left an empty "Sign in" form with only the error on it.
import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { createAccountPartWay } from '../harness/admin';
import { Booted, newEmail, OpenApp, PASSWORD, Phone } from '../harness/phone';

/** Pass to Phone.open: the app as it starts, RootNavigator deciding what shows. */
function rootNavigator(mods: Booted): ReactElement {
  const { RootNavigator } = mods.require<any>('src/navigation/RootNavigator');
  return mods.React.createElement(RootNavigator);
}

const NETWORK_ERROR = 'Network error. Please check your connection';

/** The sign-in screen, as the user sees it. */
class SignInForm {
  /** Whether the launch spinner ever showed after the app opened. */
  spinnerShown = false;

  constructor(private readonly app: OpenApp) {}

  private get screen() {
    return this.app.screen;
  }

  private watch(): void {
    if (this.screen.queryByTestId('root-loading')) this.spinnerShown = true;
  }

  shown(): boolean {
    return this.screen.queryByTestId('auth') != null;
  }

  title(): string {
    return this.screen.getByTestId('auth-title').props.children;
  }

  value(id: 'auth-name' | 'auth-email' | 'auth-password' | 'auth-confirm-password'): string {
    return this.screen.getByTestId(id).props.value;
  }

  error(): string | null {
    return this.screen.queryByTestId('auth-error-text')?.props.children ?? null;
  }

  press(id: string): void {
    this.app.mods.rtl.fireEvent.press(this.screen.getByTestId(id));
  }

  type(id: string, text: string): void {
    this.app.mods.rtl.fireEvent.changeText(this.screen.getByTestId(id), text);
  }

  private busy(): boolean {
    return this.screen.queryByTestId('auth-submit')?.props.accessibilityState?.busy === true;
  }

  /**
   * Presses the form's button and waits for the attempt to end: an error, or
   * the screen gone (signed in). The Auth emulator sometimes drops a request
   * on a busy runner (harness/authRetry): that attempt ends in the network
   * error with the form kept, and is pressed again, as withAuthRetry does.
   */
  async submit(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      await this.app.act(async () => this.press('auth-submit'));
      this.watch();
      await this.app.until(() => {
        this.watch();
        return !this.shown() || (!this.busy() && this.error() != null);
      }, 'the attempt to end');
      if (attempt >= 4 || !this.shown() || this.error() !== NETWORK_ERROR) return;
    }
  }
}

it('[ACCOUNT-2] a sign-up or sign-in that fails keeps the form: the mode, the name, the email and the password', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-07 12:00');
  // The address is already registered.
  const email = newEmail('taken');
  createAccountPartWay(email, PASSWORD, 604);

  const phone = new Phone('phone');
  const app = await phone.open(rootNavigator);
  try {
    await app.until(() => app.screen.queryByTestId('auth') != null, 'the sign-in screen');
    const form = new SignInForm(app);
    expect(form.title()).toBe('Welcome back');

    // Sign up with it: "already registered", and everything typed is still there.
    form.press('auth-switch-mode');
    expect(form.title()).toBe('Create account');
    form.type('auth-name', 'Maryam');
    form.type('auth-email', email);
    form.type('auth-password', 'another-password');
    form.type('auth-confirm-password', 'another-password');
    await form.submit();
    expect(form.shown()).toBe(true);
    expect(form.error()).toBe('This email is already registered');
    expect(form.title()).toBe('Create account');
    expect(form.value('auth-name')).toBe('Maryam');
    expect(form.value('auth-email')).toBe(email);
    expect(form.value('auth-password')).toBe('another-password');
    expect(form.value('auth-confirm-password')).toBe('another-password');

    // Over to sign in (the name and email come along), with the wrong password.
    form.press('auth-switch-mode');
    expect(form.title()).toBe('Welcome back');
    expect(form.value('auth-email')).toBe(email);
    await form.submit();
    expect(form.shown()).toBe(true);
    // The emulator says auth/wrong-password; production, with email enumeration
    // protection, says auth/invalid-credential ("Invalid email or password").
    expect(form.error()).toBe('Incorrect password');
    expect(form.title()).toBe('Welcome back');
    expect(form.value('auth-email')).toBe(email);
    expect(form.value('auth-password')).toBe('another-password');

    // Neither attempt took the screen away.
    expect(form.spinnerShown).toBe(false);
    expect(app.auth.firebaseUser).toBeNull();

    // The right password: signed in, and on to the account (a new one: onboarding).
    form.type('auth-password', PASSWORD);
    await form.submit();
    expect(form.shown()).toBe(false);
    expect(app.auth.firebaseUser?.email).toBe(email);
    await app.untilLoaded();
    expect(app.app.onboardingComplete).toBe(false);
  } finally {
    await app.close();
  }
});
