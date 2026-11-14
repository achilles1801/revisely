import React from 'react';
import { Image, ImageSourcePropType, Linking, Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { useModalHold } from '../v2/modalTurn';
import { BarButton } from './ReciteBar';
import { CHECK_SUPPORT_URL } from '../../lib/reciteLive/availability';

/** The real screen the page shows: a Check take on An-Naml 23 (E2E flow 18's screenshot), light and dark. */
const PREVIEW: Record<'light' | 'dark', ImageSourcePropType> = {
  light: require('../../../assets/recite/check-preview-light.png'),
  dark: require('../../../assets/recite/check-preview-dark.png'),
};
/** Its aspect (width / height), as cropped. */
const PREVIEW_ASPECT = 1206 / 1140;

/**
 * Check, for an account without it (Majd, Nov 14 2026): a page of its own, the way Revisely introduces things (What's
 * new, Revo's opt-in): a framed real screen, a bold title, one sentence, one button, and under it "Can’t afford it?
 * Apply for support" (the Quran Muaalem License's free path, in plain view). Check is part of Revisely Premium (Majd,
 * Nov 14: the paid side is "Premium", and no prices: nothing is for sale yet), so the button is Get Premium, which is a
 * placeholder until Premium exists. One line says it's Premium, following along stays free, and Check is AI.
 */
export function CheckIntroPage({
  visible,
  onGet,
  onClose,
}: {
  visible: boolean;
  onGet: () => void;
  onClose: () => void;
}) {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  useModalHold(visible);
  // The frame: the screen's width less the margins, and never more than 40% of its height.
  const frameWidth = Math.min(width - 48, (height * 0.4) * PREVIEW_ASPECT);
  const frameHeight = frameWidth / PREVIEW_ASPECT;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]} testID="check-intro">
        <View style={styles.top}>
          <BarButton icon="close" label="Close" onPress={onClose} testID="check-intro-close" />
        </View>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={[styles.frame, { width: frameWidth, height: frameHeight, borderColor: palette.outline, backgroundColor: palette.bg }]}>
            <Image
              source={PREVIEW[isDark ? 'dark' : 'light']}
              style={{ width: frameWidth, height: frameHeight }}
              resizeMode="cover"
              accessibilityLabel="A page of An-Naml with a wrong word marked in red and a haraka slip in amber"
            />
          </View>
          <Text style={[styles.title, { color: palette.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
            Check as you recite
          </Text>
          <Text style={[styles.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
            Revisely marks a wrong or missed word in red, and a haraka or tajweed slip in amber. Tap one to see what you
            said.
          </Text>
        </ScrollView>
        <View style={styles.bottom}>
          <PillButton title="Get Premium" size="lg" onPress={onGet} testID="check-intro-get" />
          <Tap
            onPress={() => Linking.openURL(CHECK_SUPPORT_URL).catch(() => undefined)}
            style={styles.support}
            accessibilityRole="link"
            accessibilityLabel="Can’t afford it? Apply for support"
            testID="check-intro-support"
          >
            <Text style={[typeV2.button, styles.supportText, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
              Can’t afford it? Apply for support
            </Text>
          </Tap>
          <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
            Check is part of Premium. Following along stays free. Check is AI and can make mistakes.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { height: 48, paddingHorizontal: 8, justifyContent: 'center' },
  content: { paddingHorizontal: 24, paddingBottom: 16 },
  frame: { borderRadius: 28, borderWidth: 1, overflow: 'hidden', marginTop: 4, alignSelf: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center', marginTop: 28 },
  body: { fontSize: 17, lineHeight: 24, textAlign: 'center', marginTop: 10 },
  bottom: { paddingHorizontal: 24, gap: 2 },
  support: { height: 46, alignItems: 'center', justifyContent: 'center' },
  supportText: { fontSize: 16 },
  note: { textAlign: 'center', paddingHorizontal: layoutV2.gutter },
});
