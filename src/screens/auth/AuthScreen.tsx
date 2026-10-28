import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GoogleGIcon } from '../../components/GoogleGIcon';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { arabicV2, layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  signInWithGoogle as triggerGoogleSignIn,
  isGoogleAuthAvailable,
  statusCodes,
  isErrorWithCode,
} from '../../lib/googleAuth';
import { signInWithApple as triggerAppleSignIn } from '../../lib/appleAuth';

type AuthMode = 'login' | 'signup' | 'reset';

/**
 * A text field in the new design: a label over a filled field (the quiet
 * fill, a hairline that turns ink while focused), the placeholder in the
 * secondary colour; a password field has a show / hide eye.
 */
function FieldV2({
  label,
  reveal,
  testID,
  ...input
}: TextInputProps & {
  label: string;
  /** A password field: whether it shows, and the eye that toggles it. */
  reveal?: { shown: boolean; toggle: () => void };
  testID: string;
}) {
  const { palette } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={v2.field}>
      <Text style={[typeV2.meta, v2.label, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
      <View
        style={[v2.fieldShell, { backgroundColor: palette.fill, borderColor: focused ? palette.text : palette.separator }]}
        testID={`${testID}-shell`}
      >
        <TextInput
          {...input}
          style={[typeV2.body, v2.input, { color: palette.text }]}
          placeholderTextColor={palette.secondary}
          secureTextEntry={reveal ? !reveal.shown : undefined}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          accessibilityLabel={label}
          maxFontSizeMultiplier={2}
          testID={testID}
        />
        {reveal ? (
          <Tap
            onPress={reveal.toggle}
            hitSlop={8}
            style={v2.eye}
            accessibilityRole="button"
            accessibilityLabel={reveal.shown ? 'Hide password' : 'Show password'}
            testID={`${testID}-reveal`}
          >
            <Ionicons name={reveal.shown ? 'eye-off-outline' : 'eye-outline'} size={22} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, signInWithApple, sendPasswordReset, error, isLoading, clearError } = useAuth();
  const { isDark, palette } = useTheme();
  const haptics = useHaptics();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleGoogleSignIn = async () => {
    clearError();
    setLocalError('');
    setGoogleLoading(true);
    try {
      const { idToken } = await triggerGoogleSignIn();
      await signInWithGoogle(idToken);
    } catch (err: unknown) {
      // User cancelled the sheet — not an error worth surfacing.
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }
      const message =
        err instanceof Error ? err.message : "Couldn't sign in with Google.";
      setLocalError(message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    clearError();
    setLocalError('');
    setAppleLoading(true);
    try {
      const { identityToken, rawNonce, fullName } = await triggerAppleSignIn();
      await signInWithApple(identityToken, rawNonce, fullName ?? undefined);
    } catch (err: any) {
      // ERR_REQUEST_CANCELED = user dismissed the sheet; not an error worth surfacing.
      if (err?.code !== 'ERR_REQUEST_CANCELED') {
        setLocalError(err?.message ?? "Couldn't sign in with Apple.");
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSubmit = async () => {
    clearError();
    setLocalError('');

    if (mode === 'signup' && !name.trim()) {
      setLocalError('Please enter your name');
      return;
    }

    if (!email.trim()) {
      setLocalError('Please enter your email');
      return;
    }

    if (mode !== 'reset' && !password.trim()) {
      setLocalError('Please enter your password');
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else if (mode === 'signup') {
        await signUp(email.trim(), password, name.trim());
      } else if (mode === 'reset') {
        await sendPasswordReset(email.trim());
        setResetSent(true);
        haptics.success();
      }
    } catch (err) {
      // Error is handled by AuthContext
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    clearError();
    setLocalError('');
    setResetSent(false);
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const displayError = localError || error;

  const busy = isLoading || googleLoading || appleLoading;
  const title = mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password';
  // Flat: the bismillah and a title, filled fields, the one solid action,
  // then Apple and Google under "or". Errors are a red line of text with an
  // icon, read out as they appear.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="auth">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={v2.content}
          keyboardShouldPersistTaps="handled"
          testID="auth-scroll"
        >
          <View style={v2.header}>
            <Text
              style={[arabicV2(28), v2.centered, { color: palette.text }]}
              accessibilityLanguage="ar"
              maxFontSizeMultiplier={1.6}
            >
              بِسْمِ اللَّهِ
            </Text>
            <Text
              style={[typeV2.largeTitle, v2.centered, { color: palette.text }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.6}
              testID="auth-title"
            >
              {title}
            </Text>
            {mode === 'reset' && !resetSent ? (
              <Text style={[typeV2.body, v2.centered, v2.subtitle, { color: palette.secondary }]}>
                We'll email you a link to set a new password.
              </Text>
            ) : null}
          </View>

          {resetSent ? (
            <View style={v2.sent} testID="auth-reset-sent">
              <Mark done />
              <Text
                style={[typeV2.body, v2.centered, { color: palette.text }]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                Password reset email sent. Check your inbox.
              </Text>
              <PillButton
                title="Back to sign in"
                size="lg"
                onPress={() => switchMode('login')}
                style={v2.sentButton}
                testID="auth-back-to-login"
              />
            </View>
          ) : (
            <>
              <View style={v2.form}>
                {mode === 'signup' && (
                  <FieldV2
                    label="Name"
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    autoCapitalize="words"
                    autoCorrect={false}
                    testID="auth-name"
                  />
                )}
                <FieldV2
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  testID="auth-email"
                />
                {mode !== 'reset' && (
                  <FieldV2
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    autoComplete="password"
                    reveal={{ shown: showPassword, toggle: () => setShowPassword(!showPassword) }}
                    testID="auth-password"
                  />
                )}
                {mode === 'signup' && (
                  <FieldV2
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="••••••••"
                    autoComplete="password"
                    reveal={{ shown: showConfirmPassword, toggle: () => setShowConfirmPassword(!showConfirmPassword) }}
                    testID="auth-confirm-password"
                  />
                )}

                {displayError ? (
                  <View
                    style={v2.error}
                    accessible
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={`Error: ${displayError}`}
                    testID="auth-error"
                  >
                    <Ionicons name="alert-circle-outline" size={18} color={palette.red} style={v2.errorIcon} />
                    <Text style={[typeV2.body, v2.errorText, { color: palette.red }]} testID="auth-error-text">
                      {displayError}
                    </Text>
                  </View>
                ) : null}

                <PillButton
                  title={mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
                  size="lg"
                  onPress={handleSubmit}
                  busy={isLoading}
                  style={v2.submit}
                  testID="auth-submit"
                />

                {mode === 'login' && (
                  <Tap
                    onPress={() => switchMode('reset')}
                    style={v2.link}
                    accessibilityRole="button"
                    testID="auth-forgot"
                  >
                    <Text style={[typeV2.body, { color: palette.link }]} maxFontSizeMultiplier={1.6}>
                      Forgot password?
                    </Text>
                  </Tap>
                )}
              </View>

              <Tap
                onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                style={v2.link}
                accessibilityRole="button"
                testID="auth-switch-mode"
              >
                <Text style={[typeV2.body, v2.centered, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
                  {mode === 'login' ? "Don't have an account? " : mode === 'signup' ? 'Already have an account? ' : ''}
                  <Text style={[typeV2.name, { color: palette.link }]}>
                    {mode === 'login' ? 'Sign up' : mode === 'signup' ? 'Sign in' : 'Back to sign in'}
                  </Text>
                </Text>
              </Tap>

              <View style={v2.divider}>
                <View style={[v2.dividerLine, { backgroundColor: palette.separator }]} />
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
                  or
                </Text>
                <View style={[v2.dividerLine, { backgroundColor: palette.separator }]} />
              </View>

              {appleAvailable && (
                // Apple's own button, in its black or white style to match the ground.
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={
                    isDark
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={radiusV2.sheet}
                  style={v2.apple}
                  onPress={handleAppleSignIn}
                  testID="auth-apple"
                />
              )}

              {isGoogleAuthAvailable && (
                // Google's light / dark button: the ground, a stroke, ink text, the "G" in its colours.
                <Tap
                  onPress={handleGoogleSignIn}
                  disabled={busy}
                  style={[
                    v2.google,
                    { backgroundColor: palette.bg, borderColor: palette.secondary },
                    busy && !googleLoading && v2.dimmed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  accessibilityState={{ disabled: busy, busy: googleLoading }}
                  testID="auth-google"
                >
                  {googleLoading ? (
                    <ActivityIndicator size="small" color={palette.text} />
                  ) : (
                    <>
                      <GoogleGIcon size={18} />
                      <Text style={[typeV2.button, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                        Continue with Google
                      </Text>
                    </>
                  )}
                </Tap>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const v2 = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 48,
    paddingBottom: 32,
  },
  centered: { textAlign: 'center' },
  header: { alignItems: 'center', gap: 8, marginBottom: 32 },
  subtitle: { maxWidth: 320 },
  form: { marginBottom: 8 },
  field: { marginBottom: 16 },
  label: { marginBottom: 6 },
  fieldShell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radiusV2.media,
    borderWidth: 1,
  },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  eye: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  errorIcon: { marginTop: 1 },
  errorText: { flex: 1 },
  submit: { marginTop: 4 },
  link: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: layoutV2.hairline },
  apple: { width: '100%', height: 48, marginBottom: 12 },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radiusV2.sheet,
    borderWidth: 1,
  },
  dimmed: { opacity: 0.4 },
  sent: { alignItems: 'center', gap: 16 },
  sentButton: { alignSelf: 'stretch', marginTop: 8 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
});
