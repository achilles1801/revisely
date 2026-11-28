// Sign-in B's email page (AUTH-4; board ~/Documents/revisely-auth-mocks/v2/png/B2, B4–B6): "Create your account" or
// "Sign in with email" on one page, the link at its foot switching between them with everything typed kept. A wrong
// password or an email that already has an account says so in the board's words, turns the field red and offers the way
// on. Forgot password? opens ResetPasswordSheet (AUTH-5).

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenSafeAreaView } from '../../../components/SafeAreaView';
import { HeroGlow } from '../../../components/v2/HeroGlow';
import { PillButton } from '../../../components/v2/PillButton';
import { Tap } from '../../../components/v2/Tap';
import { IconButton } from '../../../components/v2/TopBar';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../../theme/v2';
import { t } from '../../../i18n';
import { backIcon } from '../../../i18n/direction';
import type { AuthStackParamList } from '../../../navigation/AuthNavigator';
import { FieldGroup, type FieldSpec } from './FieldGroup';
import { BUTTON_HEIGHT } from './providers';
import { ResetPasswordSheet } from './ResetPasswordSheet';

export type EmailMode = 'create' | 'signIn';

/** A new account's password: at least this many characters (the board's "At least 8 characters."). */
export const MIN_PASSWORD = 8;

type Field = 'name' | 'email' | 'password';
/** What a failed attempt says, the field at fault, and the way on it offers. */
interface Problem {
  text: string;
  field: Field | null;
  action?: 'forgot' | 'signInInstead';
}

/** Firebase's answer as the board words it (AUTH-4); anything else in AuthContext's own words. */
export function problemOf(code: string | null, message: string, mode: EmailMode): Problem {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return mode === 'signIn' ? { text: t('auth.b.wrongPassword'), field: 'password', action: 'forgot' } : { text: message, field: null };
    case 'auth/email-already-in-use':
      return { text: t('auth.b.emailUsed'), field: 'email', action: 'signInInstead' };
    case 'auth/invalid-email':
    case 'auth/user-not-found':
      return { text: message, field: 'email' };
    case 'auth/weak-password':
      return { text: message, field: 'password' };
    default:
      return { text: message, field: null };
  }
}

export default function SignInEmailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'SignInEmail'>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'SignInEmail'>>();
  const { palette } = useTheme();
  const { signIn, signUp, error, errorCode, clearError, isSigningIn } = useAuth();
  const [mode, setMode] = useState<EmailMode>(route.params?.mode ?? 'create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [local, setLocal] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // AuthContext's error is shown here only for this page's own attempt (not a reset's, nor Apple's or Google's).
  const [ownAttempt, setOwnAttempt] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // Leaving the page takes its error with it, so the welcome starts clean.
  useEffect(() => () => clearError(), []);

  const creating = mode === 'create';
  const problem: Problem | null = local ?? (ownAttempt && error ? problemOf(errorCode, error, mode) : null);
  const busy = submitting || isSigningIn;

  const switchTo = (next: EmailMode) => {
    setMode(next);
    setLocal(null);
    setOwnAttempt(false);
    clearError();
  };

  const submit = async () => {
    if (busy) return;
    clearError();
    setOwnAttempt(false);
    if (creating && !name.trim()) return setLocal({ text: t('auth.b.needName'), field: 'name' });
    if (!email.trim()) return setLocal({ text: t('auth.b.needEmail'), field: 'email' });
    if (!password) return setLocal({ text: t('auth.b.needPassword'), field: 'password' });
    if (creating && password.length < MIN_PASSWORD) return setLocal({ text: t('auth.b.shortPassword'), field: 'password' });
    setLocal(null);
    setOwnAttempt(true);
    setSubmitting(true);
    try {
      if (creating) await signUp(email.trim(), password, name.trim());
      else await signIn(email.trim(), password);
    } catch {
      // AuthContext has the error; everything typed stays (ACCOUNT-2).
    } finally {
      setSubmitting(false);
    }
  };

  const openReset = () => {
    setOwnAttempt(false);
    setLocal(null);
    clearError();
    setResetOpen(true);
  };

  const fields: FieldSpec[] = [
    ...(creating
      ? [
          {
            key: 'name',
            label: t('auth.b.name'),
            value: name,
            onChangeText: setName,
            placeholder: t('auth.b.namePlaceholder'),
            autoCapitalize: 'words' as const,
            autoCorrect: false,
            autoComplete: 'name' as const,
            textContentType: 'name' as const,
            returnKeyType: 'next' as const,
            testID: 'field-name',
          },
        ]
      : []),
    {
      key: 'email',
      label: t('auth.b.emailLabel'),
      value: email,
      onChangeText: setEmail,
      placeholder: 'you@example.com', // i18n-ignore (an address's shape, the same in every language)
      keyboardType: 'email-address',
      autoCapitalize: 'none',
      autoCorrect: false,
      autoComplete: 'email',
      textContentType: creating ? 'username' : 'emailAddress',
      returnKeyType: 'next',
      testID: 'field-email',
    },
    {
      key: 'password',
      label: t('auth.b.password'),
      value: password,
      onChangeText: setPassword,
      secret: true,
      autoCapitalize: 'none',
      autoCorrect: false,
      autoComplete: creating ? 'new-password' : 'current-password',
      textContentType: creating ? 'newPassword' : 'password',
      returnKeyType: 'go',
      onSubmitEditing: submit,
      testID: 'field-password',
    },
  ];

  return (
    <ScreenSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="email-page">
      <HeroGlow />
      {/* The fields and the button stay above the keyboard, on an SE too (AUTH-4): the page lifts and scrolls. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          testID="email-scroll"
        >
          <View style={styles.back}>
            <IconButton icon={backIcon()} onPress={() => navigation.goBack()} label={t('common.back')} size={26} testID="email-back" />
          </View>
          <Text style={[typeV2.largeTitle, styles.title, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.6} testID="email-title">
            {creating ? t('auth.b.createTitle') : t('auth.b.signInTitle')}
          </Text>

          <FieldGroup fields={fields} wrong={problem?.field ?? null} testID="field-group" />

          {problem ? (
            <View
              style={styles.problem}
              accessible
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              accessibilityLabel={t('auth.screen.error', { message: problem.text })}
              testID="email-error"
            >
              <Ionicons name="alert-circle" size={18} color={palette.red} style={styles.problemIcon} />
              <Text style={[typeV2.body, styles.problemText, { color: palette.red }]} maxFontSizeMultiplier={1.6} testID="email-error-text">
                {problem.text}
                {problem.action ? ' ' : ''}
                {problem.action ? (
                  <Text
                    style={[typeV2.name, { color: palette.link }]}
                    onPress={problem.action === 'forgot' ? openReset : () => switchTo('signIn')}
                    accessibilityRole="button"
                    suppressHighlighting
                    testID="email-error-action"
                  >
                    {problem.action === 'forgot' ? t('auth.b.forgot') : t('auth.b.signInInstead')}
                  </Text>
                ) : null}
              </Text>
            </View>
          ) : creating ? (
            <Text style={[typeV2.meta, styles.hint, { color: palette.secondary }]} maxFontSizeMultiplier={1.6} testID="email-hint">
              {t('auth.b.passwordHint')}
            </Text>
          ) : null}

          <PillButton
            title={creating ? t('auth.b.create') : t('auth.b.signIn')}
            size="lg"
            onPress={submit}
            busy={submitting}
            disabled={busy && !submitting}
            style={[styles.submit, !problem && !creating && styles.submitAfterGroup]}
            testID="email-submit"
          />

          {!creating && problem?.action !== 'forgot' ? (
            <Tap onPress={openReset} style={styles.link} accessibilityRole="button" testID="email-forgot">
              <Text style={[typeV2.name, styles.centered, { color: palette.link }]} maxFontSizeMultiplier={1.6}>
                {t('auth.b.forgot')}
              </Text>
            </Tap>
          ) : null}

          <Tap onPress={() => switchTo(creating ? 'signIn' : 'create')} style={styles.link} accessibilityRole="button" testID="email-switch">
            <Text style={[typeV2.menu, styles.centered, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
              {creating ? t('auth.b.haveAccount') : t('auth.b.newHere')}
              <Text style={[typeV2.menu, styles.strong, { color: palette.link }]}>{creating ? t('auth.b.signIn') : t('auth.b.createLink')}</Text>
            </Text>
          </Tap>
        </ScrollView>
      </KeyboardAvoidingView>

      <ResetPasswordSheet visible={resetOpen} initialEmail={email.trim()} onClose={() => setResetOpen(false)} />
    </ScreenSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: layoutV2.gutter, paddingBottom: 24 },
  back: { marginStart: -8, marginTop: 4, alignSelf: 'flex-start' },
  title: { marginTop: 12, marginBottom: 24 },
  centered: { textAlign: 'center' },
  hint: { marginTop: 12, marginStart: 4 },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 },
  problemIcon: { marginTop: 1 },
  problemText: { flex: 1 },
  submit: { marginTop: 16, minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2 },
  submitAfterGroup: { marginTop: 12 },
  link: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 12 },
  strong: { fontWeight: '600' },
});
