import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { layoutV2 } from '../../theme/v2';
import { ReciteCheckNotice } from '../reciteCheck/ReciteCheckNotice';

/**
 * The model's AI notice (Quran Muaalem License 1.0, 2.1), before the first take that listens (Recite or Check: the
 * follower is the same model). Once agreed it doesn't come again; Settings → About keeps it.
 */
export function ReciteNoticeSheet({ visible, onAgree, onClose }: { visible: boolean; onAgree: () => void; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Before you recite" scroll testID="recite-notice-sheet">
      <View style={styles.block}>
        <ReciteCheckNotice />
        <View style={styles.pad}>
          <PillButton title="I understand" size="lg" onPress={onAgree} testID="recite-notice-agree" />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12, paddingBottom: 16 },
  pad: { paddingHorizontal: layoutV2.gutter },
});
