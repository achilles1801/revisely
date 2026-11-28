// Sign-in B is static (Majd, Nov 28 2026: "the sign in shouldn't be scrollable it should be static"): no scroll view, and
// everything fits on one screen from an SE to a Pro Max, at the default and the largest text size, in English and Arabic,
// with the keyboard up on the email page. Measured with jest/staticFit (the system font's own widths; it errs tall).
// A screen that would scroll, clip a line or overlap fails here.
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
jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    isAvailableAsync: jest.fn(async () => true),
    AppleAuthenticationButton: (props: object) => <View {...props} />,
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  };
});
jest.mock('../../../../lib/googleAuth', () => ({
  signInWithGoogle: jest.fn(async () => {
    throw new Error('Google couldn’t sign you in just now. Check your connection and try again.');
  }),
  isGoogleAuthAvailable: true,
  statusCodes: { SIGN_IN_CANCELLED: 'cancelled' },
  isErrorWithCode: () => false,
}));
jest.mock('../../../../lib/appleAuth', () => ({ signInWithApple: jest.fn() }));
jest.mock('../../../../lib/openWebPage', () => ({ openWebPage: jest.fn(async () => undefined) }));

const mockAuth: Record<string, any> = {};
jest.mock('../../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import { AuthNavigator } from '../../../../navigation/AuthNavigator';
import { DesignProvider } from '../../../../design/DesignContext';
import { ThemeProvider } from '../../../../context/ThemeContext';
import { allOf, find, heightOf, heightUntil, lineWidth, linesOf, type HostNode } from '../../../../../jest/staticFit';

/** The phones: an SE and a Pro Max, their safe areas, and the keyboard's height with its predictive bar. */
const PHONES = {
  SE: { width: 375, height: 667, top: 20, bottom: 0, keyboard: 260 },
  'Pro Max': { width: 440, height: 956, top: 62, bottom: 34, keyboard: 346 },
} as const;
/** The screens' side margin (layoutV2.gutter). */
const GUTTER = 16;
/** The largest accessibility text size (body 17 pt drawn at 53 pt), and the default. */
const SIZES = { largest: 3.12, default: 1 } as const;

let dims: jest.SpyInstance | undefined;
const keyboard: Record<string, (e?: unknown) => void> = {};

async function open(phone: keyof typeof PHONES, fontScale: number, lang: 'en' | 'ar') {
  const p = PHONES[phone];
  dims?.mockRestore();
  dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: p.width, height: p.height, scale: 3, fontScale });
  const { i18n } = jest.requireActual('../../../../i18n') as typeof import('../../../../i18n');
  await i18n.changeLanguage(lang);
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

const tree = () => screen.toJSON() as unknown as HostNode;
const node = (id: string) => {
  const n = find(tree(), id);
  if (!n) throw new Error(`no ${id}`);
  return n;
};

/**
 * No scroll view, and no line of it cut to fit: a text held to one line (a full-width button's label) fits on that line at
 * its capped size, inside the screen's margins and the button's own padding (`lineRoom`).
 */
function expectStatic(root: HostNode, lineRoom: number, fontScale: number) {
  expect(allOf(root, 'RCTScrollView')).toEqual([]);
  for (const text of allOf(root, 'Text')) {
    expect(text.props.adjustsFontSizeToFit).toBeFalsy();
    if (text.props.numberOfLines == null) continue;
    const st = Object.assign({}, ...[text.props.style].flat(10).filter(Boolean));
    const cap = text.props.maxFontSizeMultiplier;
    const size = (st.fontSize ?? 14) * (cap ? Math.min(cap, fontScale) : fontScale);
    const words = (function textOf(n: HostNode | string): string {
      return typeof n === 'string' ? n : (n.children ?? []).map(textOf).join('');
    })(text);
    expect(lineWidth(words, size, st.fontWeight)).toBeLessThanOrEqual(lineRoom);
  }
}

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const k of Object.keys(mockAuth)) delete mockAuth[k];
  Object.assign(mockAuth, {
    signIn: jest.fn(async () => undefined),
    signUp: jest.fn(async () => {
      mockAuth.error = 'This email is already registered';
      mockAuth.errorCode = 'auth/email-already-in-use';
      throw Object.assign(new Error('used'), { code: 'auth/email-already-in-use' });
    }),
    signInWithGoogle: jest.fn(async () => undefined),
    signInWithApple: jest.fn(async () => undefined),
    sendPasswordReset: jest.fn(async () => undefined),
    clearError: jest.fn(),
    error: null,
    errorCode: null,
    isSigningIn: false,
    // AUTH-2's line shows: the welcome at its tallest.
    signInDropped: true,
  });
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e?: unknown) => void) => {
    keyboard[event] = cb;
    return { remove: () => undefined };
  }) as never);
});
afterEach(async () => {
  const { i18n } = jest.requireActual('../../../../i18n') as typeof import('../../../../i18n');
  await i18n.changeLanguage('en');
  dims?.mockRestore();
  dims = undefined;
  jest.restoreAllMocks();
});

describe('the measure itself', () => {
  it('wraps at spaces, and a longer line takes more lines', () => {
    expect(linesOf('Even one verse counts.', 1000, 17)).toBe(1);
    expect(linesOf('Even one verse counts.', 60, 17)).toBeGreaterThan(2);
    expect(linesOf('', 100, 17)).toBe(0);
  });
});

describe.each(Object.keys(PHONES) as (keyof typeof PHONES)[])('[AUTH-3] [AUTH-4] sign-in B is static on an %s', (phone) => {
  const p = PHONES[phone];
  const room = p.height - p.top - p.bottom;

  describe.each(['en', 'ar'] as const)('in %s', (lang) => {
    it.each(Object.keys(SIZES) as (keyof typeof SIZES)[])(
      'the welcome, with AUTH-2’s line and a Google error showing, fits without scrolling at the %s text size',
      async (size) => {
        await open(phone, SIZES[size], lang);
        // Google failing: its words above the buttons (the welcome at its tallest).
        await act(async () => {
          fireEvent.press(screen.getByTestId('signin-google'));
        });
        expect(screen.getByTestId('signin-error')).toBeTruthy();
        const root = node('signin-welcome');
        expectStatic(root, p.width - 2 * GUTTER - 40, SIZES[size]);
        expect(heightOf(root, p.width, SIZES[size])).toBeLessThanOrEqual(room);
      },
    );

    it.each(Object.keys(SIZES) as (keyof typeof SIZES)[])(
      'the email page, creating with an error showing, fits; with the keyboard up the fields and the button stay above it (%s text)',
      async (size) => {
        mockAuth.signInDropped = false;
        await open(phone, SIZES[size], lang);
        await act(async () => {
          fireEvent.press(screen.getByTestId('signin-email'));
        });
        await act(async () => {});
        fireEvent.changeText(screen.getByTestId('field-name'), 'Maryam bint Abdullah ibn Muhammad al-Hashimiyya');
        fireEvent.changeText(screen.getByTestId('field-email'), 'maryam.bint.abdullah.al.hashimiyya.longaddress@subdomain.example-university.edu');
        fireEvent.changeText(screen.getByTestId('field-password'), 'a-long-password');
        await act(async () => {
          fireEvent.press(screen.getByTestId('email-submit'));
        });
        expect(screen.getByTestId('email-error')).toBeTruthy();
        const root = node('email-page');
        expectStatic(root, p.width - 2 * GUTTER - 40, SIZES[size]);
        expect(heightOf(root, p.width, SIZES[size])).toBeLessThanOrEqual(room);

        // The keyboard comes up: what's above it holds the fields, the error and the button.
        await act(async () => {
          keyboard.keyboardWillShow?.({ endCoordinates: { height: p.keyboard } });
          keyboard.keyboardDidShow?.({ endCoordinates: { height: p.keyboard } });
        });
        const above = p.height - p.top - p.keyboard;
        expect(heightUntil(node('email-content'), 'email-submit', p.width, SIZES[size])).toBeLessThanOrEqual(above);
        // A short phone moves the title into ‹'s row; a tall one keeps the big title.
        expect(flatTitleSize()).toBe(p.height < 750 ? 17 : 28);
      },
    );
  });
});

function flatTitleSize(): number {
  const style = [screen.getByTestId('email-title').props.style].flat(10).filter(Boolean);
  return Object.assign({}, ...style).fontSize;
}
