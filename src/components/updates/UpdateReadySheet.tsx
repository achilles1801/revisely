import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { applyUpdate, postponeUpdateOffer, useUpdateOffer } from '../../lib/updates/ota';
import { useBusyReasons } from '../../lib/updates/busy';

/** The screen settles first (the splash going, a session's end). */
export const UPDATE_OFFER_DELAY_MS = 1200;

/**
 * "A new update is ready · Update now" (lib/updates/ota): opens by itself once
 * an update has downloaded that the launch didn't apply, over a tab's main
 * screen. Never during a session, a recording, a recitation or a timer: it
 * waits until they end. Later puts it off until the next cold start. Mounted on
 * Home; the tabs stay mounted, so it opens over Read and Insights too.
 */
export function UpdateReadySheet() {
  const { palette } = useTheme();
  const { visible } = useUpdateOffer();
  // Every reason counts, the screen too: only a tab's main screen, nothing going on.
  const busy = useBusyReasons().length > 0;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!visible || busy || shown) return;
    const t = setTimeout(() => setShown(true), UPDATE_OFFER_DELAY_MS);
    return () => clearTimeout(t);
  }, [visible, busy, shown]);

  const later = () => {
    setShown(false);
    postponeUpdateOffer();
  };
  return (
    <Sheet
      visible={shown && visible}
      onClose={later}
      title="A new update is ready"
      footer={{ label: 'Later', onPress: later, testID: 'update-ready-later' }}
      testID="update-ready-sheet"
    >
      <View style={styles.body}>
        <Text style={[typeV2.body, styles.centred, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          Revisely restarts to finish updating. It takes a moment.
        </Text>
        <Text style={[typeV2.meta, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          Your plan, progress and recordings stay as they are.
        </Text>
        <PillButton
          title="Update now"
          size="lg"
          onPress={() => void applyUpdate()}
          style={styles.button}
          testID="update-ready-now"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: 8, gap: 10 },
  centred: { textAlign: 'center' },
  button: { marginTop: 8 },
});
