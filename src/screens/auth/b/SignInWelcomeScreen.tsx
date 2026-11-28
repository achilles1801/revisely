// Sign-in B's welcome (AUTH-3; board ~/Documents/revisely-auth-mocks/v2/png/B1): Home's glow, the basmala, "Revisely"
// and the app's line, then Continue with Apple, Google or email at the foot, and the Terms.
//
// Static (Majd, Nov 28 2026: "the sign in shouldn't be scrollable it should be static"): no scroll view. Everything fits
// on one screen from an SE to a Pro Max at the largest text size, because each text's growth is capped (CAP) instead of
// the screen scrolling. SignInB.fit.test measures it.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenSafeAreaView } from '../../../components/SafeAreaView';
import { HeroGlow } from '../../../components/v2/HeroGlow';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { openWebPage } from '../../../lib/openWebPage';
import { arabicFullV2, layoutV2, typeV2 } from '../../../theme/v2';
import { t } from '../../../i18n';
import type { AuthStackParamList } from '../../../navigation/AuthNavigator';
import { AppleButton, EmailButton, GoogleButton, useProviderSignIn } from './providers';

export const TERMS_URL = 'https://revisely.app/terms/';

/** How far each kind of text grows with the phone's text size, so the screen never needs to scroll. */
export const CAP = { basmala: 1, brand: 1.15, line: 1.3, foot: 1.3 } as const;

export default function SignInWelcomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'SignInWelcome'>>();
  const { palette } = useTheme();
  const { error: authError, signInDropped } = useAuth();
  const providers = useProviderSignIn();
  // A sheet's own failure, or Firebase refusing what Apple or Google handed it (the email page shows its own).
  const error = providers.error || (providers.busy ? '' : authError);

  return (
    <ScreenSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="signin-welcome">
      <HeroGlow />
      <View style={styles.middle} testID="signin-welcome-middle">
        <Text style={[arabicFullV2(36), styles.centered, { color: palette.text }]} accessibilityLanguage="ar" maxFontSizeMultiplier={CAP.basmala}>
          بِسْمِ ٱللَّهِ
        </Text>
        <Text
          style={[styles.brand, styles.centered, { color: palette.text }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={CAP.brand}
          testID="signin-brand"
        >
          {'Revisely' /* i18n-ignore (the app's name) */}
        </Text>
        <Text style={[typeV2.menu, styles.centered, styles.line, { color: palette.secondary }]} maxFontSizeMultiplier={CAP.line} testID="signin-slogan">
          {t('common.slogan')}
        </Text>
        {signInDropped ? (
          // AUTH-2: a sign-in saved on this phone that Firebase dropped at launch. One quiet line.
          <Text style={[typeV2.body, styles.centered, styles.line, { color: palette.secondary }]} maxFontSizeMultiplier={CAP.line} testID="signin-signed-out">
            {t('auth.screen.signedOut')}
          </Text>
        ) : null}
      </View>

      <View style={styles.foot}>
        {error ? (
          <View
            style={styles.error}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('auth.screen.error', { message: error })}
            testID="signin-error"
          >
            <Ionicons name="alert-circle" size={18} color={palette.red} style={styles.errorIcon} />
            <Text style={[typeV2.body, styles.errorText, { color: palette.red }]} maxFontSizeMultiplier={CAP.foot} testID="signin-error-text">
              {error}
            </Text>
          </View>
        ) : null}
        {providers.appleAvailable ? <AppleButton onPress={providers.apple} /> : null}
        {providers.googleAvailable ? (
          <GoogleButton onPress={providers.google} busy={providers.googleBusy} disabled={providers.busy && !providers.googleBusy} />
        ) : null}
        <EmailButton
          onPress={() => navigation.navigate('SignInEmail', { mode: signInDropped ? 'signIn' : 'create' })}
          disabled={providers.busy}
        />
        <Text style={[typeV2.meta, styles.centered, styles.terms, { color: palette.secondary }]} maxFontSizeMultiplier={CAP.foot} testID="signin-agree">
          {t('auth.b.agree')}
          <Text
            style={[typeV2.meta, styles.termsLink, { color: palette.link }]}
            onPress={() => void openWebPage(TERMS_URL)}
            accessibilityRole="link"
            suppressHighlighting
            testID="signin-terms"
          >
            {t('auth.b.terms')}
          </Text>
        </Text>
      </View>
    </ScreenSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  middle: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: layoutV2.gutter + 8, paddingVertical: 16 },
  centered: { textAlign: 'center' },
  brand: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.6, marginTop: 4 },
  line: { maxWidth: 320 },
  foot: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 12, gap: 12 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorIcon: { marginTop: 1 },
  errorText: { flex: 1 },
  terms: { marginTop: 10 },
  termsLink: { fontWeight: '600' },
});
