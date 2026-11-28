// Sign-in B's three ways in (AUTH-3): Apple's own button, Google's, and email's, each 50 pt tall with round ends, one
// size (board ~/Documents/revisely-auth-mocks/v2/png/B1). Apple's is Apple's native button, in its black or white style,
// so Apple's rules hold; Google's keeps Google's colours (palette.google) and its "G".

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleGIcon } from '../../../components/GoogleGIcon';
import { Tap } from '../../../components/v2/Tap';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { signInWithApple as triggerAppleSignIn } from '../../../lib/appleAuth';
import {
  signInWithGoogle as triggerGoogleSignIn,
  isGoogleAuthAvailable,
  statusCodes,
  isErrorWithCode,
} from '../../../lib/googleAuth';
import { typeV2 } from '../../../theme/v2';
import { t } from '../../../i18n';

/** Every button's height and its round ends (the board's 50 pt pills). */
export const BUTTON_HEIGHT = 50;
/** How far a button's words grow with the phone's text size: one line still fits in BUTTON_HEIGHT. */
export const CAP_BUTTON = 1.2;
const RADIUS = BUTTON_HEIGHT / 2;

/**
 * Apple's and Google's sheets, and the account they hand to Firebase. A cancelled sheet says nothing; a sheet that fails
 * says why in its own words (`error`); once Firebase has the credential, a refusal is AuthContext's `error`.
 */
export function useProviderSignIn() {
  const { signInWithGoogle, signInWithApple, clearError, isSigningIn } = useAuth();
  const [error, setError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let live = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => live && setAppleAvailable(ok))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const busy = googleBusy || appleBusy || isSigningIn;

  const google = async () => {
    if (busy) return;
    clearError();
    setError('');
    setGoogleBusy(true);
    try {
      let idToken: string;
      try {
        ({ idToken } = await triggerGoogleSignIn());
      } catch (err: unknown) {
        if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return;
        setError(err instanceof Error ? err.message : t('auth.errors.other'));
        return;
      }
      await signInWithGoogle(idToken).catch(() => undefined);
    } finally {
      setGoogleBusy(false);
    }
  };

  const apple = async () => {
    if (busy) return;
    clearError();
    setError('');
    setAppleBusy(true);
    try {
      let credential: Awaited<ReturnType<typeof triggerAppleSignIn>>;
      try {
        credential = await triggerAppleSignIn();
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string } | null;
        if (e?.code !== 'ERR_REQUEST_CANCELED') setError(e?.message ?? t('auth.errors.other'));
        return;
      }
      const { identityToken, rawNonce, fullName } = credential;
      await signInWithApple(identityToken, rawNonce, fullName ?? undefined).catch(() => undefined);
    } finally {
      setAppleBusy(false);
    }
  };

  return { google, apple, error, busy, googleBusy, appleBusy, appleAvailable, googleAvailable: isGoogleAuthAvailable };
}

/** Apple's own button: "Continue with Apple", black on light, white on dark. */
export function AppleButton({ onPress }: { onPress: () => void }) {
  const { isDark } = useTheme();
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={RADIUS}
      style={styles.apple}
      onPress={onPress}
      testID="signin-apple"
    />
  );
}

/** One of the board's outlined pills: Google's (its colours) or email's (the ground with a hairline). */
function Pill({
  kind,
  label,
  onPress,
  busy,
  disabled,
  testID,
}: {
  kind: 'google' | 'email';
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  testID: string;
}) {
  const { palette } = useTheme();
  const google = kind === 'google';
  const ink = google ? palette.google.text : palette.text;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[
        styles.pill,
        google
          ? { backgroundColor: palette.google.fill, borderColor: palette.google.edge }
          : { backgroundColor: palette.bg, borderColor: palette.outline },
        disabled && !busy && styles.dimmed,
      ]}
      testID={testID}
    >
      <View style={styles.inner}>
        {busy ? (
          <ActivityIndicator size="small" color={ink} />
        ) : google ? (
          <GoogleGIcon size={18} />
        ) : (
          <Ionicons name="mail-outline" size={20} color={ink} />
        )}
        {/* Capped so the welcome never scrolls (CAP_BUTTON), and never cut: a longer label wraps and the pill grows. */}
        <Text style={[typeV2.button, styles.label, { color: ink }]} maxFontSizeMultiplier={CAP_BUTTON} testID={`${testID}-label`}>
          {label}
        </Text>
      </View>
    </Tap>
  );
}

export function GoogleButton(props: { onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return <Pill kind="google" label={t('auth.b.google')} testID="signin-google" {...props} />;
}

export function EmailButton(props: { onPress: () => void; disabled?: boolean }) {
  return <Pill kind="email" label={t('auth.b.email')} testID="signin-email" {...props} />;
}

const styles = StyleSheet.create({
  apple: { width: '100%', height: BUTTON_HEIGHT },
  pill: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: RADIUS,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { fontSize: 17, lineHeight: 22, flexShrink: 1, textAlign: 'center' },
  dimmed: { opacity: 0.4 },
});
