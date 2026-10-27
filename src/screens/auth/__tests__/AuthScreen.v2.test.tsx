import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, color }: { name: string; color?: string }) => (
      <Text testID={`icon-${name}`} style={{ color }}>{name}</Text>
    ),
  };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
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
jest.mock('../../../lib/googleAuth', () => ({
  signInWithGoogle: jest.fn(async () => ({ idToken: 'test-id-token' })),
  isGoogleAuthAvailable: true,
  statusCodes: { SIGN_IN_CANCELLED: 'cancelled' },
  isErrorWithCode: () => false,
}));
jest.mock('../../../lib/appleAuth', () => ({ signInWithApple: jest.fn() }));

const mockAuth: Record<string, any> = {};
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import AuthScreen from '../AuthScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { PillButton } from '../../../components/v2/PillButton';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';

// A new user hasn't chosen an accent: Indigo.
const light = paletteV2(false, DEFAULT_ACCENT);
const dark = paletteV2(true, DEFAULT_ACCENT);

async function showV2(mode: 'light' | 'dark' = 'light') {
  await AsyncStorage.setItem('@revisely_theme_v2', mode);
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <AuthScreen />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));
const styleOf = (id: string) => flat(screen.getByTestId(id).props.style);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Object.assign(mockAuth, {
    signIn: jest.fn(async () => undefined),
    signUp: jest.fn(async () => undefined),
    signInWithGoogle: jest.fn(async () => undefined),
    signInWithApple: jest.fn(async () => undefined),
    sendPasswordReset: jest.fn(async () => undefined),
    clearError: jest.fn(),
    error: null,
    isLoading: false,
  });
});

describe('<AuthScreen /> in the new design: sign in', () => {
  it('flat ground, filled fields in palette colours, one solid pill, Apple black and Google outlined', async () => {
    await showV2();
    expect(styleOf('auth').backgroundColor).toBe(light.bg);
    expect(screen.getByTestId('auth-title').props.children).toBe('Welcome back');
    expect(screen.queryByTestId('auth-name')).toBeNull();
    expect(screen.queryByTestId('auth-confirm-password')).toBeNull();

    // Fields: the quiet fill, a hairline, ink text, secondary placeholder.
    for (const id of ['auth-email', 'auth-password']) {
      expect(styleOf(`${id}-shell`)).toMatchObject({ backgroundColor: light.fill, borderColor: light.separator });
      expect(styleOf(id).color).toBe(light.text);
      expect(screen.getByTestId(id).props.placeholderTextColor).toBe(light.secondary);
    }
    // Focus draws the hairline in ink.
    fireEvent(screen.getByTestId('auth-email'), 'focus');
    expect(styleOf('auth-email-shell').borderColor).toBe(light.text);
    fireEvent(screen.getByTestId('auth-email'), 'blur');
    expect(styleOf('auth-email-shell').borderColor).toBe(light.separator);

    // The one primary action.
    const pills = screen.UNSAFE_getAllByType(PillButton);
    expect(pills.map((p) => p.props.title)).toEqual(['Sign in']);
    expect(styleOf('auth-submit').backgroundColor).toBe(light.primary);

    // Apple's own button in black on white; Google's on the ground with a stroke and ink text.
    const apple = screen.getByTestId('auth-apple').props;
    expect(apple.buttonStyle).toBe(2);
    expect(apple.cornerRadius).toBe(20);
    expect(styleOf('auth-google')).toMatchObject({ backgroundColor: light.bg, borderColor: light.secondary });
    expect(flat(screen.getByText('Continue with Google').props.style).color).toBe(light.text);

    expect(flat(screen.getByText('Forgot password?').props.style).color).toBe(light.link);
    expect(flat(screen.getByText('Sign up').props.style).color).toBe(light.link);
  });

  it('a missing field is a red line of text with an icon, read out as an alert', async () => {
    await showV2();
    fireEvent.press(screen.getByTestId('auth-submit'));
    const error = screen.getByTestId('auth-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error.props.accessibilityLabel).toBe('Error: Please enter your email');
    expect(screen.getByTestId('auth-error-text').props.children).toBe('Please enter your email');
    expect(styleOf('auth-error-text').color).toBe(light.red);
    expect(flat(screen.getByTestId('icon-alert-circle-outline').props.style).color).toBe(light.red);
    expect(mockAuth.signIn).not.toHaveBeenCalled();
  });

  it('signs in with the trimmed email; the eye shows the password', async () => {
    await showV2();
    fireEvent.changeText(screen.getByTestId('auth-email'), '  someone@example.com ');
    fireEvent.changeText(screen.getByTestId('auth-password'), 'test-password');
    expect(screen.getByTestId('auth-password').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByTestId('auth-password').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Hide password')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-submit'));
    });
    expect(mockAuth.signIn).toHaveBeenCalledWith('someone@example.com', 'test-password');
    // Taps don't buzz in the new design.
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it("the account's error from sign-in shows the same way", async () => {
    mockAuth.error = 'Incorrect email or password.';
    await showV2();
    expect(screen.getByTestId('auth-error-text').props.children).toBe('Incorrect email or password.');
    expect(styleOf('auth-error-text').color).toBe(light.red);
  });

  it('busy: the pill shows it, and Google waits', async () => {
    mockAuth.isLoading = true;
    await showV2();
    expect(screen.getByTestId('auth-submit').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByTestId('auth-google').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('Continue with Google signs in with its token', async () => {
    await showV2();
    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-google'));
    });
    expect(mockAuth.signInWithGoogle).toHaveBeenCalledWith('test-id-token');
  });

  it('dark: a black ground, and Apple’s button in white', async () => {
    await showV2('dark');
    expect(styleOf('auth').backgroundColor).toBe(dark.bg);
    expect(screen.getByTestId('auth-apple').props.buttonStyle).toBe(0);
    expect(styleOf('auth-email-shell').backgroundColor).toBe(dark.fill);
    expect(screen.getByTestId('auth-email').props.placeholderTextColor).toBe(dark.secondary);
    expect(styleOf('auth-submit').backgroundColor).toBe(dark.primary);
    expect(styleOf('auth-google')).toMatchObject({ backgroundColor: dark.bg, borderColor: dark.secondary });
  });
});

describe('<AuthScreen /> in the new design: sign up', () => {
  it('adds Name and Confirm Password; passwords must match; creates the account', async () => {
    await showV2();
    fireEvent.press(screen.getByTestId('auth-switch-mode'));
    expect(screen.getByTestId('auth-title').props.children).toBe('Create account');
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Confirm Password')).toBeTruthy();
    expect(screen.queryByText('Forgot password?')).toBeNull();
    expect(screen.UNSAFE_getAllByType(PillButton).map((p) => p.props.title)).toEqual(['Create account']);

    fireEvent.changeText(screen.getByTestId('auth-name'), 'Aisha');
    fireEvent.changeText(screen.getByTestId('auth-email'), 'someone@example.com');
    fireEvent.changeText(screen.getByTestId('auth-password'), 'test-password');
    fireEvent.changeText(screen.getByTestId('auth-confirm-password'), 'other-password');
    fireEvent.press(screen.getByTestId('auth-submit'));
    expect(screen.getByTestId('auth-error-text').props.children).toBe('Passwords do not match');
    expect(mockAuth.signUp).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('auth-confirm-password'), 'test-password');
    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-submit'));
    });
    expect(mockAuth.signUp).toHaveBeenCalledWith('someone@example.com', 'test-password', 'Aisha');

    // And back.
    fireEvent.press(screen.getByTestId('auth-switch-mode'));
    expect(screen.getByTestId('auth-title').props.children).toBe('Welcome back');
  });
});

describe('<AuthScreen /> in the new design: password reset', () => {
  it('email only, with a subtitle; sent is a done check, a line and a way back', async () => {
    await showV2();
    fireEvent.press(screen.getByTestId('auth-forgot'));
    expect(screen.getByTestId('auth-title').props.children).toBe('Reset password');
    expect(screen.getByText("We'll email you a link to set a new password.")).toBeTruthy();
    expect(screen.queryByTestId('auth-password')).toBeNull();
    expect(screen.UNSAFE_getAllByType(PillButton).map((p) => p.props.title)).toEqual(['Send reset link']);

    fireEvent.changeText(screen.getByTestId('auth-email'), 'someone@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-submit'));
    });
    expect(mockAuth.sendPasswordReset).toHaveBeenCalledWith('someone@example.com');
    expect(screen.getByTestId('auth-reset-sent')).toBeTruthy();
    const check = screen.getByTestId('mark-done', { includeHiddenElements: true });
    expect(flat(check.props.style).backgroundColor).toBe(light.done);
    expect(screen.getByText('Password reset email sent. Check your inbox.')).toBeTruthy();
    // An outcome: the success haptic.
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');

    fireEvent.press(screen.getByTestId('auth-back-to-login'));
    expect(screen.getByTestId('auth-title').props.children).toBe('Welcome back');
  });

  it('Back to sign in from the reset form', async () => {
    await showV2();
    fireEvent.press(screen.getByTestId('auth-forgot'));
    fireEvent.press(screen.getByText('Back to sign in'));
    expect(screen.getByTestId('auth-title').props.children).toBe('Welcome back');
  });
});
