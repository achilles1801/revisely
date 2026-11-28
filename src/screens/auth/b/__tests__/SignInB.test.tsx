// Sign-in B (Revisely Dev, AUTH-3–5): the welcome, the email page and the Forgot password sheet, in the navigator they run
// in, with AuthContext stood in. Board: ~/Documents/revisely-auth-mocks/v2/png/B1–B6.
import React from 'react';
import { Dimensions, Keyboard } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, color }: { name: string; color?: string }) => (
      <Text testID={`icon-${name}`} style={{ color }}>
        {name}
      </Text>
    ),
  };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockAppleAvailable = { value: true };
jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    isAvailableAsync: jest.fn(async () => mockAppleAvailable.value),
    AppleAuthenticationButton: (props: object) => <View {...props} />,
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  };
});
jest.mock('../../../../lib/googleAuth', () => ({
  signInWithGoogle: jest.fn(async () => ({ idToken: 'test-id-token' })),
  isGoogleAuthAvailable: true,
  statusCodes: { SIGN_IN_CANCELLED: 'cancelled' },
  isErrorWithCode: (e: unknown) => !!(e as { code?: string })?.code,
}));
jest.mock('../../../../lib/appleAuth', () => ({ signInWithApple: jest.fn() }));
jest.mock('../../../../lib/openWebPage', () => ({ openWebPage: jest.fn(async () => undefined) }));

const mockAuth: Record<string, any> = {};
jest.mock('../../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import { AuthNavigator } from '../../../../navigation/AuthNavigator';
import { DesignProvider } from '../../../../design/DesignContext';
import { ThemeProvider } from '../../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../../theme/v2';
import { arabicLines, clippedArabic } from '../../../../../jest/arabicLines';
import { openWebPage } from '../../../../lib/openWebPage';
import { signInWithGoogle as triggerGoogle } from '../../../../lib/googleAuth';
import { TERMS_URL } from '../SignInWelcomeScreen';
import { problemOf } from '../SignInEmailScreen';

const light = paletteV2(false, DEFAULT_ACCENT);
const dark = paletteV2(true, DEFAULT_ACCENT);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(10).filter(Boolean));
const styleOf = (id: string) => flat(screen.getByTestId(id).props.style);
const textOf = (id: string) => {
  const walk = (n: any): string => (typeof n === 'string' ? n : (n?.children ?? []).map(walk).join(''));
  return walk(screen.getByTestId(id));
};

let dims: jest.SpyInstance | undefined;
/** The phone's text size (Dynamic Type): 1 is the default, 3.1 the largest accessibility size. */
function textSize(fontScale: number, width = 375, height = 667) {
  dims?.mockRestore();
  dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, scale: 2, fontScale });
}

async function open(mode: 'light' | 'dark' = 'light') {
  await AsyncStorage.setItem('@revisely_theme_v2', mode);
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <NavigationContainer>
          <AuthNavigator />
        </NavigationContainer>
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

async function toEmail() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('signin-email'));
  });
  await act(async () => {});
}

const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
const press = async (id: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(id));
  });
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockAppleAvailable.value = true;
  textSize(1);
  for (const k of Object.keys(mockAuth)) delete mockAuth[k];
  Object.assign(mockAuth, {
    signIn: jest.fn(async () => undefined),
    signUp: jest.fn(async () => undefined),
    signInWithGoogle: jest.fn(async () => undefined),
    signInWithApple: jest.fn(async () => undefined),
    sendPasswordReset: jest.fn(async () => undefined),
    clearError: jest.fn(),
    error: null,
    errorCode: null,
    isSigningIn: false,
    signInDropped: false,
  });
});
afterAll(() => dims?.mockRestore());

/** AuthContext answering an attempt with Firebase's `code` (it keeps `error` and `errorCode` and throws). */
function refuse(fn: 'signIn' | 'signUp' | 'sendPasswordReset', code: string, message: string) {
  mockAuth[fn] = jest.fn(async () => {
    mockAuth.error = message;
    mockAuth.errorCode = code;
    throw Object.assign(new Error(message), { code });
  });
}

describe('[AUTH-3] sign-in B’s welcome', () => {
  it('the basmala, Revisely and the app’s line; Apple, Google and email at the foot, one size; the Terms', async () => {
    await open();
    expect(screen.getByText('بِسْمِ ٱللَّهِ')).toBeTruthy();
    expect(screen.getByTestId('signin-brand')).toHaveTextContent('Revisely');
    expect(screen.getByTestId('signin-slogan')).toHaveTextContent('Even one verse counts.');
    expect(screen.getByTestId('hero-glow').props.pointerEvents).toBe('none');

    // Apple's own button, "Continue", black on light, round ends: 50 pt like the others.
    const apple = screen.getByTestId('signin-apple');
    expect(apple.props.buttonType).toBe(1);
    expect(apple.props.buttonStyle).toBe(2);
    expect(apple.props.cornerRadius).toBe(25);
    expect(flat(apple.props.style).height).toBe(50);
    for (const id of ['signin-google', 'signin-email']) {
      expect(styleOf(id).minHeight).toBe(50);
      expect(styleOf(id).borderRadius).toBe(25);
    }
    expect(screen.getByTestId('signin-google-label')).toHaveTextContent('Continue with Google');
    expect(screen.getByTestId('signin-email-label')).toHaveTextContent('Continue with email');
    // Google's own colours (light): white, a grey edge, near-black words.
    expect(styleOf('signin-google').backgroundColor).toBe(light.google.fill);
    expect(styleOf('signin-google').borderColor).toBe('#747775');
    expect(styleOf('signin-google-label').color).toBe('#1F1F1F');
    expect(screen.getByTestId('icon-mail-outline')).toBeTruthy();

    expect(screen.getByText(/By continuing you agree to the/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('signin-terms'));
    expect(openWebPage).toHaveBeenCalledWith(TERMS_URL);
  });

  it('in dark: Apple’s white button and Google’s dark one', async () => {
    await open('dark');
    expect(screen.getByTestId('signin-apple').props.buttonStyle).toBe(0);
    expect(styleOf('signin-google').backgroundColor).toBe('#131314');
    expect(styleOf('signin-google').borderColor).toBe('#8E918F');
    expect(styleOf('signin-google-label').color).toBe('#E3E3E3');
    expect(styleOf('signin-welcome').backgroundColor).toBe(dark.bg);
  });

  it('no Apple button where the phone doesn’t offer Sign in with Apple', async () => {
    mockAppleAvailable.value = false;
    await open();
    expect(screen.queryByTestId('signin-apple')).toBeNull();
    expect(screen.getByTestId('signin-google')).toBeTruthy();
    expect(screen.getByTestId('signin-email')).toBeTruthy();
  });

  it('AUTH-2’s line under the app’s line, and Continue with email then opens on signing in', async () => {
    mockAuth.signInDropped = true;
    await open();
    expect(screen.getByTestId('signin-signed-out')).toHaveTextContent('You were signed out. Sign in again to carry on.');
    await toEmail();
    expect(screen.getByTestId('email-title')).toHaveTextContent('Sign in with email');
  });

  it('Google failing says why above the buttons and keeps the welcome; cancelled says nothing', async () => {
    (triggerGoogle as jest.Mock).mockRejectedValueOnce(new Error('Google is unavailable right now.'));
    await open();
    await press('signin-google');
    expect(screen.getByTestId('signin-error-text')).toHaveTextContent('Google is unavailable right now.');
    expect(screen.getByTestId('signin-welcome')).toBeTruthy();
    expect(mockAuth.signInWithGoogle).not.toHaveBeenCalled();

    (triggerGoogle as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
    await press('signin-google');
    expect(screen.queryByTestId('signin-error')).toBeNull();

    // Google's account handed over: Firebase signs in with it.
    await press('signin-google');
    expect(mockAuth.signInWithGoogle).toHaveBeenCalledWith('test-id-token');
  });

  it('at the largest text, on an SE: static (no scroll view), every text capped, nothing cut, the Arabic keeps its marks', async () => {
    // How it fits is SignInB.fit.test's; here, that it never scrolls and each text has its cap (Majd, Nov 28 2026).
    textSize(3.1);
    await open();
    expect(screen.UNSAFE_root.findAll((n: any) => n.type === 'RCTScrollView')).toEqual([]);
    for (const id of ['signin-slogan', 'signin-brand', 'signin-google-label', 'signin-email-label', 'signin-agree']) {
      expect(screen.getByTestId(id).props.numberOfLines).toBeUndefined();
      expect(screen.getByTestId(id).props.adjustsFontSizeToFit).toBeFalsy();
      expect(screen.getByTestId(id).props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.3);
    }
    expect(arabicLines(screen.UNSAFE_root as never).length).toBeGreaterThan(0);
    expect(clippedArabic(screen.UNSAFE_root as never)).toEqual([]);
  });
});

describe('[AUTH-4] sign-in B’s email page', () => {
  it('opens on creating: Name, Email and Password in one group, the 8-character hint, Create account; ‹ goes back', async () => {
    await open();
    await toEmail();
    expect(screen.getByTestId('email-title')).toHaveTextContent('Create your account');
    expect(screen.getByTestId('field-name-label')).toHaveTextContent('Name');
    expect(screen.getByTestId('field-email-label')).toHaveTextContent('Email');
    expect(screen.getByTestId('field-password-label')).toHaveTextContent('Password');
    expect(screen.getByTestId('field-password').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByTestId('field-password-reveal'));
    expect(screen.getByTestId('field-password').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('email-hint')).toHaveTextContent('At least 8 characters.');
    expect(screen.getByTestId('email-submit')).toHaveTextContent('Create account');
    expect(styleOf('email-submit').backgroundColor).toBe(light.primary);
    expect(textOf('email-switch')).toBe('Have an account? Sign in');
    await press('email-back');
    expect(screen.getByTestId('signin-welcome')).toBeTruthy();
  });

  it('creating needs a name, an email and 8 characters; then it creates the account with them', async () => {
    await open();
    await toEmail();
    await press('email-submit');
    expect(screen.getByTestId('email-error-text')).toHaveTextContent('Enter your name.');
    expect(styleOf('field-name-label').color).toBe(light.red);
    type('field-name', 'Maryam');
    type('field-email', 'maryam@example.com');
    type('field-password', 'short');
    await press('email-submit');
    expect(screen.getByTestId('email-error-text')).toHaveTextContent('Use at least 8 characters.');
    expect(styleOf('field-password-label').color).toBe(light.red);
    expect(mockAuth.signUp).not.toHaveBeenCalled();
    type('field-password', 'a-long-password');
    await press('email-submit');
    expect(mockAuth.signUp).toHaveBeenCalledWith('maryam@example.com', 'a-long-password', 'Maryam');
  });

  it('the link at the foot switches to signing in and back, keeping what’s typed', async () => {
    await open();
    await toEmail();
    type('field-name', 'Maryam');
    type('field-email', 'maryam@example.com');
    type('field-password', 'a-long-password');
    await press('email-switch');
    expect(screen.getByTestId('email-title')).toHaveTextContent('Sign in with email');
    expect(screen.queryByTestId('field-name')).toBeNull();
    expect(screen.getByTestId('field-email').props.value).toBe('maryam@example.com');
    expect(screen.getByTestId('field-password').props.value).toBe('a-long-password');
    expect(screen.getByTestId('email-forgot')).toHaveTextContent('Forgot password?');
    expect(textOf('email-switch')).toBe('New here? Create an account');
    await press('email-submit');
    expect(mockAuth.signIn).toHaveBeenCalledWith('maryam@example.com', 'a-long-password');
    await press('email-switch');
    expect(screen.getByTestId('field-name').props.value).toBe('Maryam');
  });

  it('a wrong password: the board’s words, the group and Password in red, Forgot password? opens the sheet; nothing typed is lost', async () => {
    refuse('signIn', 'auth/wrong-password', 'Incorrect password');
    mockAuth.signInDropped = true;
    await open();
    await toEmail();
    type('field-email', 'maryam@example.com');
    type('field-password', 'not-the-one');
    await press('email-submit');
    expect(textOf('email-error-text')).toBe('That password doesn’t match this email. Forgot password?');
    expect(styleOf('field-group').borderColor).toBe(light.red);
    expect(styleOf('field-password-label').color).toBe(light.red);
    expect(styleOf('field-email-label').color).toBe(light.text);
    expect(screen.getByTestId('email-title')).toHaveTextContent('Sign in with email');
    expect(screen.getByTestId('field-email').props.value).toBe('maryam@example.com');
    expect(screen.getByTestId('field-password').props.value).toBe('not-the-one');
    // Forgot password? is in the error line now, not twice.
    expect(screen.queryByTestId('email-forgot')).toBeNull();
    await press('email-error-action');
    expect(screen.getByTestId('reset-sheet')).toBeTruthy();
    expect(screen.getByTestId('reset-email').props.value).toBe('maryam@example.com');
  });

  it('production’s answer for a wrong password (invalid-credential) reads the same; creating, it is AuthContext’s words', () => {
    expect(problemOf('auth/invalid-credential', 'Invalid email or password', 'signIn')).toEqual({
      text: 'That password doesn’t match this email.',
      field: 'password',
      action: 'forgot',
    });
    expect(problemOf('auth/network-request-failed', 'Network error. Please check your connection', 'signIn')).toEqual({
      text: 'Network error. Please check your connection',
      field: null,
    });
  });

  it('an email that already has an account: the board’s words, Email in red; Sign in instead keeps the email and password', async () => {
    refuse('signUp', 'auth/email-already-in-use', 'This email is already registered');
    await open();
    await toEmail();
    type('field-name', 'Maryam');
    type('field-email', 'maryam@example.com');
    type('field-password', 'a-long-password');
    await press('email-submit');
    expect(textOf('email-error-text')).toBe('This email already has an account. Sign in instead');
    expect(styleOf('field-group').borderColor).toBe(light.red);
    expect(styleOf('field-email-label').color).toBe(light.red);
    expect(styleOf('field-name-label').color).toBe(light.text);
    expect(screen.getByTestId('field-name').props.value).toBe('Maryam');
    mockAuth.error = null;
    mockAuth.errorCode = null;
    await press('email-error-action');
    expect(screen.getByTestId('email-title')).toHaveTextContent('Sign in with email');
    expect(screen.getByTestId('field-email').props.value).toBe('maryam@example.com');
    expect(screen.getByTestId('field-password').props.value).toBe('a-long-password');
    expect(screen.queryByTestId('email-error')).toBeNull();
    expect(styleOf('field-group').borderColor).toBe(light.fill);
  });

  it('at the largest text: each label beside its field and capped, nothing is cut, a long name and email stay whole', async () => {
    textSize(3.1);
    await open();
    await toEmail();
    const name = 'Maryam bint Abdullah ibn Muhammad al-Hashimiyya';
    const email = 'maryam.bint.abdullah.al.hashimiyya.longaddress@subdomain.example-university.edu';
    type('field-name', name);
    type('field-email', email);
    for (const f of ['field-name', 'field-email', 'field-password']) {
      expect(styleOf(`${f}-row`).flexDirection).toBe('row');
      expect(screen.getByTestId(`${f}-label`).props.maxFontSizeMultiplier).toBe(1.25);
      expect(screen.getByTestId(f).props.maxFontSizeMultiplier).toBe(1.25);
      expect(screen.getByTestId(`${f}-label`).props.numberOfLines).toBeUndefined();
      expect(screen.getByTestId(f).props.maxLength).toBeUndefined();
      expect(screen.getByTestId(f).props.numberOfLines).toBeUndefined();
    }
    expect(screen.getByTestId('field-name').props.value).toBe(name);
    expect(screen.getByTestId('field-email').props.value).toBe(email);
    expect(screen.getByTestId('email-title').props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('email-hint').props.numberOfLines).toBeUndefined();
  });

  it('at the default text size each label is beside its field, and a long label wraps rather than being cut', async () => {
    await open();
    await toEmail();
    expect(styleOf('field-email-row').flexDirection).toBe('row');
    expect(styleOf('field-email-label').width).toBe(120);
    expect(screen.getByTestId('field-email-label').props.numberOfLines).toBeUndefined();
  });

  it('with the keyboard up on an SE: the page lifts and never scrolls; the title moves into ‹’s row; a tap outside puts the keyboard away', async () => {
    const listeners: Record<string, () => void> = {};
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      listeners[event] = cb;
      return { remove: () => undefined };
    }) as never);
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    try {
      textSize(1, 375, 667);
      await open();
      await toEmail();
      expect(screen.UNSAFE_root.findAll((n: any) => n.type === 'RCTScrollView')).toEqual([]);
      // Inside the keyboard's lift.
      let node: any = screen.getByTestId('email-content').parent;
      let lifted = false;
      while (node) {
        if (node.props?.behavior === 'padding' || node.props?.behavior === 'height') lifted = true;
        node = node.parent;
      }
      expect(lifted).toBe(true);
      expect(styleOf('email-title').fontSize).toBe(28);
      await act(async () => listeners.keyboardWillShow?.());
      expect(styleOf('email-title').fontSize).toBe(17);
      fireEvent.press(screen.getByTestId('email-content'));
      expect(dismiss).toHaveBeenCalled();
      await act(async () => listeners.keyboardWillHide?.());
      expect(styleOf('email-title').fontSize).toBe(28);
    } finally {
      add.mockRestore();
      dismiss.mockRestore();
    }
  });
});

describe('[AUTH-5] sign-in B’s Forgot password', () => {
  async function openSheet() {
    await open();
    await toEmail();
    await press('email-switch');
    type('field-email', 'maryam@example.com');
    await press('email-forgot');
  }

  it('a sheet with the email already typed; Send link sends it and says so; Done closes it with the page as it was', async () => {
    await openSheet();
    expect(screen.getByText('Reset your password')).toBeTruthy();
    expect(screen.getByText('We’ll email you a link to set a new one.')).toBeTruthy();
    expect(screen.getByTestId('reset-email').props.value).toBe('maryam@example.com');
    await press('reset-send');
    expect(mockAuth.sendPasswordReset).toHaveBeenCalledWith('maryam@example.com');
    expect(screen.getByTestId('reset-sent')).toHaveTextContent(/We sent a link to .*maryam@example.com/);
    expect(screen.getByText('Check your email')).toBeTruthy();
    await press('reset-done');
    expect(screen.getByTestId('field-email').props.value).toBe('maryam@example.com');
    expect(screen.queryByTestId('email-error')).toBeNull();
  });

  it('a failure keeps the email and says why, in the sheet only', async () => {
    refuse('sendPasswordReset', 'auth/network-request-failed', 'Network error. Please check your connection');
    await openSheet();
    type('reset-email', 'maryam@example.org');
    await press('reset-send');
    expect(screen.getByTestId('reset-error-text')).toHaveTextContent('Network error. Please check your connection');
    expect(screen.getByTestId('reset-email').props.value).toBe('maryam@example.org');
    expect(screen.queryByTestId('reset-sent')).toBeNull();
    // The page behind keeps its own state: no error of the reset's on it.
    expect(screen.queryByTestId('email-error')).toBeNull();
  });

  it('an empty email asks for one and sends nothing', async () => {
    await open();
    await toEmail();
    await press('email-switch');
    await press('email-forgot');
    await press('reset-send');
    expect(screen.getByTestId('reset-error-text')).toHaveTextContent('Enter your email.');
    expect(mockAuth.sendPasswordReset).not.toHaveBeenCalled();
  });
});

describe('sign-in B in Arabic', () => {
  it('the welcome and the email page in Arabic: the app’s line «ولو آية», nothing cut', async () => {
    const { i18n } = jest.requireActual('../../../../i18n') as typeof import('../../../../i18n');
    await i18n.changeLanguage('ar');
    try {
      textSize(3.1);
      await open();
      expect(screen.getByTestId('signin-slogan')).toHaveTextContent('ولو آية');
      expect(screen.getByTestId('signin-email-label')).toHaveTextContent('المتابعة بالبريد الإلكتروني');
      expect(clippedArabic(screen.UNSAFE_root as never)).toEqual([]);
      await toEmail();
      expect(screen.getByTestId('email-title')).toHaveTextContent('أنشئ حسابك');
      expect(screen.getByTestId('field-email-label')).toHaveTextContent('البريد الإلكتروني');
      expect(screen.getByTestId('field-email-label').props.numberOfLines).toBeUndefined();
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
