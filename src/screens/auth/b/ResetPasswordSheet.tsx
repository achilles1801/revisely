// Sign-in B's Forgot password (AUTH-5; board ~/Documents/revisely-auth-mocks/v2/png/B3): a sheet over the email page,
// the email already typed, Send link. Sent, it says so; a failure keeps the email and says why.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Mark } from '../../../components/v2/Mark';
import { PillButton } from '../../../components/v2/PillButton';
import { Sheet } from '../../../components/v2/Sheet';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { useHaptics } from '../../../design/haptics';
import { typeV2 } from '../../../theme/v2';
import { t } from '../../../i18n';
import { FieldGroup } from './FieldGroup';
import { BUTTON_HEIGHT } from './providers';

export function ResetPasswordSheet({ visible, initialEmail, onClose }: { visible: boolean; initialEmail: string; onClose: () => void }) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const { sendPasswordReset, error, clearError } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);

  // Each opening starts from the email page's address.
  useEffect(() => {
    if (!visible) return;
    setEmail(initialEmail);
    setSent(null);
    setFailed(false);
    setMissing(false);
  }, [visible]);

  const close = () => {
    clearError();
    onClose();
  };

  const send = async () => {
    if (sending) return;
    setFailed(false);
    const address = email.trim();
    setMissing(!address);
    if (!address) return;
    setSending(true);
    try {
      await sendPasswordReset(address);
      setSent(address);
      haptics.success();
    } catch {
      // AuthContext has the words; the email stays.
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  const problem = missing ? t('auth.b.needEmail') : failed ? error : null;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={sent ? t('auth.b.sentTitle') : t('auth.b.resetTitle')}
      message={sent ? undefined : t('auth.b.resetBody')}
      headerRule="none"
      keyboard
      testID="reset-sheet"
    >
      <View style={styles.body}>
        {sent ? (
          <View style={styles.sent} testID="reset-sent">
            <Mark done />
            <Text style={[typeV2.menu, styles.centered, { color: palette.text }]} accessibilityRole="alert" accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.6}>
              {t('auth.b.sent', { email: sent })}
            </Text>
            <PillButton title={t('common.done')} size="lg" onPress={close} style={styles.button} testID="reset-done" />
          </View>
        ) : (
          <>
            <FieldGroup
              fields={[
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
                  textContentType: 'emailAddress',
                  returnKeyType: 'send',
                  onSubmitEditing: send,
                  testID: 'reset-email',
                },
              ]}
              wrong={problem ? 'email' : null}
              testID="reset-group"
            />
            {problem ? (
              <View style={styles.problem} accessible accessibilityRole="alert" accessibilityLiveRegion="polite" testID="reset-error">
                <Ionicons name="alert-circle" size={18} color={palette.red} style={styles.problemIcon} />
                <Text style={[typeV2.body, styles.problemText, { color: palette.red }]} maxFontSizeMultiplier={1.6} testID="reset-error-text">
                  {problem}
                </Text>
              </View>
            ) : null}
            <PillButton title={t('auth.b.sendLink')} size="lg" onPress={send} busy={sending} style={styles.button} testID="reset-send" />
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 8 },
  centered: { textAlign: 'center' },
  sent: { alignItems: 'center', gap: 14, paddingTop: 4 },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  problemIcon: { marginTop: 1 },
  problemText: { flex: 1 },
  button: { marginTop: 16, minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, alignSelf: 'stretch' },
});
