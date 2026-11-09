import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { markOffered, openStore, storeName, useStoreDecision } from '../../lib/updates/storeUpdates';
import { useBusyReasons } from '../../lib/updates/busy';
import { useUpdateOffer } from '../../lib/updates/ota';
import { modalShowing, useModalShowing } from '../v2/modalTurn';

/** Home settles first. */
export const OFFER_DELAY_MS = 1200;

/**
 * "New version available" (lib/updates/storeUpdates): once per version, on
 * Home, never while a recording or recitation goes on elsewhere or a timer runs,
 * nor while another sheet is open (it waits until that one has gone).
 */
export function StoreUpdateSheet() {
  const { palette } = useTheme();
  const { offer } = useStoreDecision();
  const focused = useIsFocused();
  const busy = useBusyReasons().some((r) => r !== 'screen');
  // An update that only needs a restart goes first (UpdateReadySheet): one sheet at a time.
  const otaOffered = useUpdateOffer().visible;
  // Another sheet open (Jump to, a menu, Revo…): it waits until that one has gone (UPD-3).
  const sheetOpen = useModalShowing();
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!offer || !focused || busy || otaOffered || shown || sheetOpen) return;
    const t = setTimeout(() => {
      if (modalShowing()) return;
      setShown(offer);
      markOffered(offer);
    }, OFFER_DELAY_MS);
    return () => clearTimeout(t);
  }, [offer, focused, busy, otaOffered, shown, sheetOpen]);

  const close = () => setShown(null);
  return (
    <Sheet
      visible={shown != null}
      onClose={close}
      title="New version available"
      footer={{ label: 'Not now', onPress: close, testID: 'store-update-later' }}
      testID="store-update-sheet"
    >
      <View style={styles.body}>
        <Text style={[typeV2.body, styles.centred, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          Revisely {shown} is on {storeName()}.
        </Text>
        <Text style={[typeV2.meta, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          Your plan, progress and recordings stay as they are.
        </Text>
        <PillButton
          title="Update"
          size="lg"
          onPress={() => {
            close();
            void openStore();
          }}
          style={styles.button}
          testID="store-update-open"
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
