import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../../components/v2/TopBar';
import { OnboardingNavigator } from '../../navigation/OnboardingNavigator';
import { t } from '../../i18n';
import { OnboardingPreviewProvider } from './onboardingAccess';

/** Revisely Dev, Settings → Testing → Preview onboarding (ONBOARD-5): the real screens, and nothing is saved. */
export default function OnboardingPreviewScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const close = useCallback(() => navigation.goBack(), [navigation]);
  return (
    <OnboardingPreviewProvider onDone={close}>
      <View style={styles.fill} testID="onboarding-preview">
        <OnboardingNavigator />
        <View style={[styles.close, { top: insets.top + 12 }]}>
          <IconButton icon="close" onPress={close} label={t('onboarding.preview.close')} testID="onboarding-preview-close" />
        </View>
      </View>
    </OnboardingPreviewProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  close: { position: 'absolute', end: 16 },
});
