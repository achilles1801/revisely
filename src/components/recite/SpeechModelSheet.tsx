import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { formatModelSize } from '../../lib/recite/speechModel';
import { cancelModelDownload, startModelDownload, useSpeechModelState } from '../../lib/recite/speechModelStore';

/**
 * Following the recitation word by word needs the speech model on the phone:
 * what it does (on the device; the voice is never recorded or sent), its size,
 * a word when on mobile data, then the download with its progress. Closing the
 * sheet doesn't stop the download (Settings shows it); Cancel does.
 */
export function SpeechModelSheet({
  visible,
  onClose,
  onReady,
}: {
  visible: boolean;
  onClose: () => void;
  /** The model is on the phone. */
  onReady: () => void;
}) {
  const { palette } = useTheme();
  const model = useSpeechModelState();
  const [cellular, setCellular] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    NetInfo.fetch()
      .then((s) => {
        if (live) setCellular(s.type === 'cellular');
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [visible]);

  // Done while open: on with it.
  useEffect(() => {
    if (visible && model.status === 'ready') onReady();
    // Only when the model arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, model.status]);

  const size = formatModelSize();
  const downloading = model.status === 'downloading';
  const percent = downloading ? Math.round(model.progress * 100) : 0;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Follow word by word"
      footer={{ label: downloading ? 'Close' : 'Not now', onPress: onClose, testID: 'speech-model-close' }}
      testID="speech-model-sheet"
    >
      <View style={styles.body}>
        <Text style={[typeV2.body, styles.centred, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          Revisely can listen as you recite and show each word as you say it.
        </Text>
        <Text style={[typeV2.meta, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="speech-model-privacy">
          It works on this iPhone: your voice isn’t recorded or sent anywhere.
        </Text>
        {downloading ? (
          <View style={styles.progress} testID="speech-model-progress">
            <View style={[styles.track, { backgroundColor: palette.fill }]}>
              <View style={[styles.bar, { backgroundColor: palette.primary, width: `${percent}%` }]} />
            </View>
            <Text style={[typeV2.meta, typeV2.numeral, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              Downloading {percent}% of {size}. You can close this; it carries on.
            </Text>
            <PillButton title="Cancel" variant="outline" size="lg" onPress={cancelModelDownload} testID="speech-model-cancel" />
          </View>
        ) : (
          <View style={styles.progress}>
            <Text style={[typeV2.meta, styles.centred, { color: model.status === 'missing' && model.error ? palette.red : palette.secondary }]} maxFontSizeMultiplier={1.4} testID="speech-model-note">
              {model.status === 'missing' && model.error
                ? model.error
                : cellular
                  ? `A one-time download of ${size}. You’re on mobile data.`
                  : `A one-time download of ${size}.`}
            </Text>
            <PillButton
              title={cellular ? `Download on mobile data` : `Download ${size}`}
              size="lg"
              onPress={() => {
                startModelDownload();
              }}
              testID="speech-model-download"
            />
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: 8, gap: 10 },
  centred: { textAlign: 'center' },
  progress: { gap: 12, marginTop: 8 },
  track: { height: 6, borderRadius: radiusV2.pill, overflow: 'hidden' },
  bar: { height: 6, borderRadius: radiusV2.pill },
});
