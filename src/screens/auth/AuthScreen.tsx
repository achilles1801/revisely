import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { GoogleGIcon } from '../../components/GoogleGIcon';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  signInWithGoogle as triggerGoogleSignIn,
  isGoogleAuthAvailable,
  statusCodes,
  isErrorWithCode,
} from '../../lib/googleAuth';
import { signInWithApple as triggerAppleSignIn } from '../../lib/appleAuth';

type AuthMode = 'login' | 'signup' | 'reset';

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, signInWithApple, sendPasswordReset, error, isLoading, clearError } = useAuth();
  const { theme, isDark } = useTheme();
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.bismillah, { color: theme.accent }]}>بِسْمِ اللَّهِ</Text>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
            </Text>
            {/* <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {mode === 'login'
                ? 'Sign in to sync your progress across devices'
                : mode === 'signup'
                ? 'Create an account to save your progress'
                : 'We\'ll send you a reset link'}
            </Text> */}
          </View>

          {resetSent ? (
            <View style={styles.successBox}>
              <GlassCard
                style={StyleSheet.absoluteFillObject}
                tintColor={theme.success + '22'}
              />
              <Text style={[styles.successText, { color: theme.success }]}>
                Password reset email sent! Check your inbox.
              </Text>
              <Button
                title="Back to Login"
                onPress={() => switchMode('login')}
                variant="primary"
                style={styles.button}
              />
            </View>
          ) : (
            <>
              {displayError && (
                <View style={styles.errorBox}>
                  <GlassCard
                    style={StyleSheet.absoluteFillObject}
                    tintColor={theme.error + '22'}
                  />
                  <Text style={[styles.errorText, { color: theme.error }]}>{displayError}</Text>
                </View>
              )}

              <View style={styles.form}>
                {mode === 'signup' && (
                  <View style={styles.inputContainer}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Name</Text>
                    <View style={styles.inputShell}>
                      <GlassCard style={StyleSheet.absoluteFillObject} />
                      <TextInput
                        style={[styles.input, { color: theme.textPrimary }]}
                        value={name}
                        onChangeText={setName}
                        placeholder="Your name"
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="words"
                        autoCorrect={false}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Email</Text>
                  <View style={styles.inputShell}>
                    <GlassCard style={StyleSheet.absoluteFillObject} />
                    <TextInput
                      style={[styles.input, { color: theme.textPrimary }]}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="your@email.com"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                    />
                  </View>
                </View>

                {mode !== 'reset' && (
                  <View style={styles.inputContainer}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Password</Text>
                    <View style={styles.passwordContainer}>
                      <GlassCard style={StyleSheet.absoluteFillObject} />
                      <TextInput
                        style={[styles.passwordInput, { color: theme.textPrimary }]}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor={theme.textMuted}
                        secureTextEntry={!showPassword}
                        autoComplete="password"
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeButton}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={22}
                          color={theme.textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>
                )}

                {mode === 'signup' && (
                  <View style={styles.inputContainer}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Confirm Password</Text>
                    <View style={styles.passwordContainer}>
                      <GlassCard style={StyleSheet.absoluteFillObject} />
                      <TextInput
                        style={[styles.passwordInput, { color: theme.textPrimary }]}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="••••••••"
                        placeholderTextColor={theme.textMuted}
                        secureTextEntry={!showConfirmPassword}
                        autoComplete="password"
                      />
                      <Pressable
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeButton}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        <Ionicons
                          name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={22}
                          color={theme.textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>
                )}

                <Button
                  title={
                    isLoading
                      ? 'Loading...'
                      : mode === 'login'
                      ? 'Sign In'
                      : mode === 'signup'
                      ? 'Create Account'
                      : 'Send Reset Link'
                  }
                  onPress={handleSubmit}
                  variant="primary"
                  style={styles.button}
                  disabled={isLoading}
                />

                {mode === 'login' && (
                  <TouchableOpacity onPress={() => switchMode('reset')} style={styles.linkButton}>
                    <Text style={[styles.linkText, { color: theme.accent }]}>Forgot password?</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.switchMode}>
                {mode === 'login' ? (
                  <TouchableOpacity onPress={() => switchMode('signup')}>
                    <Text style={[styles.switchText, { color: theme.textSecondary }]}>
                      Don't have an account? <Text style={[styles.switchTextBold, { color: theme.accent }]}>Sign up</Text>
                    </Text>
                  </TouchableOpacity>
                ) : mode === 'signup' ? (
                  <TouchableOpacity onPress={() => switchMode('login')}>
                    <Text style={[styles.switchText, { color: theme.textSecondary }]}>
                      Already have an account? <Text style={[styles.switchTextBold, { color: theme.accent }]}>Sign in</Text>
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => switchMode('login')}>
                    <Text style={[styles.switchText, { color: theme.textSecondary }]}>
                      <Text style={[styles.switchTextBold, { color: theme.accent }]}>Back to login</Text>
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <Text style={[styles.dividerText, { color: theme.textMuted }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              {appleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={8}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
              )}

              {isGoogleAuthAvailable && (
                <TouchableOpacity
                  style={[
                    styles.googleButton,
                    {
                      backgroundColor: isDark ? '#131314' : '#FFFFFF',
                      borderColor: isDark ? '#8E918F' : '#747775',
                    },
                  ]}
                  onPress={handleGoogleSignIn}
                  disabled={isLoading || googleLoading || appleLoading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  accessibilityState={{ disabled: isLoading || googleLoading || appleLoading, busy: googleLoading }}
                >
                  {googleLoading ? (
                    <ActivityIndicator size="small" color={isDark ? '#E3E3E3' : '#1F1F1F'} />
                  ) : (
                    <>
                      <View style={styles.googleIcon}>
                        <GoogleGIcon size={18} />
                      </View>
                      <Text
                        style={[
                          styles.googleButtonText,
                          { color: isDark ? '#E3E3E3' : '#1F1F1F' },
                        ]}
                      >
                        Continue with Google
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl * 2,
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  bismillah: {
    fontFamily: fonts.arabic,
    fontSize: 32,
    marginBottom: spacing.lg,
    letterSpacing: 0.5,
  },
  title: {
    ...typography.displayMedium,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  errorBox: {
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  errorText: {
    ...typography.bodyMedium,
  },
  successBox: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  successText: {
    ...typography.bodyMedium,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  form: {
    marginBottom: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  inputShell: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.bodyMedium,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.bodyMedium,
  },
  eyeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: '100%',
    marginTop: spacing.md,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    ...typography.bodyMedium,
  },
  switchMode: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  switchText: {
    ...typography.bodyMedium,
  },
  switchTextBold: {
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...typography.bodySmall,
    paddingHorizontal: spacing.md,
  },
  appleButton: {
    width: '100%',
    height: 48,
    marginBottom: spacing.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: spacing.md,
    width: '100%',
    height: 48,
  },
  googleIcon: {
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.25,
  },
});
