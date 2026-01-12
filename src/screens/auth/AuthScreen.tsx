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
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useAuth } from '../../context/AuthContext';
import { useGoogleAuth, getIdTokenFromResponse } from '../../lib/googleAuth';

type AuthMode = 'login' | 'signup' | 'reset';

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, sendPasswordReset, continueOffline, error, isLoading, clearError } = useAuth();
  const { request, response, promptAsync } = useGoogleAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
            <Text style={styles.bismillah}>بِسْمِ اللَّهِ</Text>
            <Text style={styles.title}>
              {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'login'
                ? 'Sign in to sync your progress across devices'
                : mode === 'signup'
                ? 'Create an account to save your progress'
                : 'We\'ll send you a reset link'}
            </Text>
          </View>

          {resetSent ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>
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
                  <Text style={styles.errorText}>{displayError}</Text>
                </View>
              )}

              <View style={styles.form}>
                {mode === 'signup' && (
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Name</Text>
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="Your name"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                  />
                </View>

                {mode !== 'reset' && (
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Password</Text>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor={colors.textMuted}
                        secureTextEntry={!showPassword}
                        autoComplete="password"
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeButton}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={22}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>
                )}

                {mode === 'signup' && (
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Confirm Password</Text>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="••••••••"
                        placeholderTextColor={colors.textMuted}
                        secureTextEntry={!showConfirmPassword}
                        autoComplete="password"
                      />
                      <Pressable
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeButton}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={22}
                          color={colors.textMuted}
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
                    <Text style={styles.linkText}>Forgot password?</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.switchMode}>
                {mode === 'login' ? (
                  <TouchableOpacity onPress={() => switchMode('signup')}>
                    <Text style={styles.switchText}>
                      Don't have an account? <Text style={styles.switchTextBold}>Sign up</Text>
                    </Text>
                  </TouchableOpacity>
                ) : mode === 'signup' ? (
                  <TouchableOpacity onPress={() => switchMode('login')}>
                    <Text style={styles.switchText}>
                      Already have an account? <Text style={styles.switchTextBold}>Sign in</Text>
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => switchMode('login')}>
                    <Text style={styles.switchText}>
                      <Text style={styles.switchTextBold}>Back to login</Text>
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignIn}
                disabled={!request || isLoading || googleLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleButtonText}>
                  {googleLoading ? 'Signing in...' : 'Continue with Google'}
                </Text>
              </TouchableOpacity>

              <Button
                title="Continue without account"
                onPress={continueOffline}
                variant="outline"
                style={styles.offlineButton}
              />

              <Text style={styles.offlineHint}>
                Your data will only be stored on this device
              </Text>
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
    backgroundColor: colors.bg,
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
    fontSize: 28,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  title: {
    ...typography.displayMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#dc2626',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.bodyMedium,
    color: '#dc2626',
  },
  successBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#22c55e',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  successText: {
    ...typography.bodyMedium,
    color: '#22c55e',
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
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  eyeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  button: {
    width: '100%',
    marginTop: spacing.md,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  linkText: {
    ...typography.bodyMedium,
    color: colors.accent,
  },
  switchMode: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  switchText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  switchTextBold: {
    color: colors.accent,
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
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4285F4',
    marginRight: spacing.sm,
  },
  googleButtonText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  offlineButton: {
    width: '100%',
  },
  offlineHint: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
