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
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useGoogleAuth, getIdTokenFromResponse } from '../../lib/googleAuth';
import { signInWithApple as triggerAppleSignIn } from '../../lib/appleAuth';

type AuthMode = 'login' | 'signup' | 'reset';

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, signInWithApple, sendPasswordReset, error, isLoading, clearError } = useAuth();
  const { theme } = useTheme();
  const { request, response, promptAsync } = useGoogleAuth();
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

  // Handle Google sign-in response
  useEffect(() => {
    const handleGoogleResponse = async () => {
      const idToken = getIdTokenFromResponse(response);
      if (idToken) {
        setGoogleLoading(true);
        clearError();
        try {
          await signInWithGoogle(idToken);
        } catch (err) {
          // Error handled by AuthContext
        } finally {
          setGoogleLoading(false);
        }
      }
    };
    handleGoogleResponse();
  }, [response]);

  const handleGoogleSignIn = async () => {
    clearError();
    setLocalError('');
    await promptAsync();
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
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
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {mode === 'login'
                ? 'Sign in to sync your progress across devices'
                : mode === 'signup'
                ? 'Create an account to save your progress'
                : 'We\'ll send you a reset link'}
            </Text>
          </View>

          {resetSent ? (
            <View style={[styles.successBox, { backgroundColor: theme.successBg, borderColor: theme.success }]}>
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
                <View style={[styles.errorBox, { backgroundColor: theme.errorBg, borderColor: theme.error }]}>
                  <Text style={[styles.errorText, { color: theme.error }]}>{displayError}</Text>
                </View>
              )}

              <View style={styles.form}>
                {mode === 'signup' && (
                  <View style={styles.inputContainer}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Name</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bgAlt, borderColor: theme.border, color: theme.textPrimary }]}
                      value={name}
                      onChangeText={setName}
                      placeholder="Your name"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Email</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bgAlt, borderColor: theme.border, color: theme.textPrimary }]}
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

                {mode !== 'reset' && (
                  <View style={styles.inputContainer}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Password</Text>
                    <View style={[styles.passwordContainer, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}>
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
                    <View style={[styles.passwordContainer, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}>
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

              <TouchableOpacity
                style={[styles.googleButton, { backgroundColor: theme.bgAlt, borderColor: theme.border }]}
                onPress={handleGoogleSignIn}
                disabled={!request || isLoading || googleLoading || appleLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
              >
                <Text style={[styles.googleIcon, { color: '#4285F4' }]}>G</Text>
                <Text style={[styles.googleButtonText, { color: theme.textPrimary }]}>
                  {googleLoading ? 'Signing in…' : 'Continue with Google'}
                </Text>
              </TouchableOpacity>
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
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: 2,
  },
  errorText: {
    ...typography.bodyMedium,
  },
  successBox: {
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
    borderRadius: 2,
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
  input: {
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.bodyMedium,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 2,
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
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 48,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: spacing.sm,
  },
  googleButtonText: {
    ...typography.bodyMedium,
    fontWeight: '500',
  },
});
