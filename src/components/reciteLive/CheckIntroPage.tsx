import React, { useEffect } from 'react';
import { Image, ImageSourcePropType, Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { useModalTurn } from '../v2/modalTurn';
import { DISMISS_FALLBACK_MS } from '../v2/Sheet';
import { BarButton } from './ReciteBar';

/** The real screen the page shows: a take marking mistakes on An-Naml 23 (E2E flow 18's screenshot), light and dark. */
const PREVIEW: Record<'light' | 'dark', ImageSourcePropType> = {
  light: require('../../../assets/recite/check-preview-light.png'),
  dark: require('../../../assets/recite/check-preview-dark.png'),
};
/** Its aspect (width / height), as cropped. */
const PREVIEW_ASPECT = 1206 / 1140;

/**
 * Marking mistakes, for an account without Premium (Majd, Nov 14 2026): a page of its own, the way Revisely introduces
 * things (What's new, Revo's opt-in): a framed real screen, "Mark my mistakes", one sentence, one button, and under it
 * "Can’t afford it? Apply for support" (the Quran Muaalem License's free path, in plain view). It's part of Revisely
 * Premium (the paid side is "Premium", with no feature name and no prices: nothing is for sale yet), so the button is
 * Get Premium, a placeholder until Premium exists. One line says it's Premium, following along stays free, and it's AI.
 */
export function CheckIntroPage({
  visible,
  getting = false,
  onGet,
  onSupport,
  onClose,
}: {
  visible: boolean;
  /** Get Premium is under way. */
  getting?: boolean;
  onGet: () => void;
  /** "Can't afford it? Apply for support": the program's page for this account (lib/premium's supportLink). */
  onSupport: () => void;
  onClose: () => void;
}) {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // One modal at a time (SHEET-1): it opens only once no sheet is up or still going, and holds its turn until iOS
  // reports it gone (onDismiss, or the fallback). "See your mistakes" opened it while the take's summary was still
  // closing; iOS refused it and its invisible host took every touch: the reader froze (Majd's Dev take, Nov 15 2026).
  const { turn, release } = useModalTurn(visible);
  useEffect(() => {
    if (turn) return;
    if (Platform.OS !== 'ios') {
      release();
      return;
    }
    const t = setTimeout(release, DISMISS_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [turn, release]);
  // The frame: the screen's width less the margins, and never more than 40% of its height.
  const frameWidth = Math.min(width - 48, (height * 0.4) * PREVIEW_ASPECT);
  const frameHeight = frameWidth / PREVIEW_ASPECT;
  return (
    <Modal visible={turn} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} onDismiss={release}>
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
              accessibilityLabel="A page of An-Naml with its mistakes highlighted"
            />
          </View>
          <Text style={[styles.title, { color: palette.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
            Mark my mistakes
          </Text>
          <Text style={[styles.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
            Revisely highlights a wrong, missed or extra word in red, and a haraka or letter slip in amber. Tap one to see
            what you said.
          </Text>
        </ScrollView>
        <View style={styles.bottom}>
          <PillButton title="Get Premium" size="lg" onPress={onGet} busy={getting} testID="check-intro-get" />
          <Tap
            onPress={onSupport}
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
            Part of Premium. Following along stays free. It’s AI and can make mistakes.
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
