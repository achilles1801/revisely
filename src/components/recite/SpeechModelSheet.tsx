import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { formatModelSize } from '../../lib/recite/speechModel';
import { cancelModelDownload, startModelDownload, useSpeechModelState } from '../../lib/recite/speechModelStore';
import { t } from '../../i18n';

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
  title = t('recite.panel.followWordByWord'),
  intro = t('recite.speechModel.intro'),
}: {
  visible: boolean;
  onClose: () => void;
  /** The model is on the phone. */
  onReady: () => void;
  /** What the model is wanted for (recite mode's words by default; search by voice has its own). */
  title?: string;
  intro?: string;
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
      title={title}
      footer={{ label: downloading ? t('common.close') : t('common.notNow'), onPress: onClose, testID: 'speech-model-close' }}
      testID="speech-model-sheet"
    >
      <View style={styles.body}>
        <Text style={[typeV2.body, styles.centred, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {intro}
        </Text>
        <Text style={[typeV2.meta, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="speech-model-privacy">
          {t('recite.speechModel.privacy')}
        </Text>
        {downloading ? (
          <View style={styles.progress} testID="speech-model-progress">
            <View style={[styles.track, { backgroundColor: palette.fill }]}>
              <View style={[styles.bar, { backgroundColor: palette.primary, width: `${percent}%` }]} />
            </View>
            <Text style={[typeV2.meta, typeV2.numeral, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {t('recite.speechModel.downloading', { percent, size })}
            </Text>
            <PillButton title={t('common.cancel')} variant="outline" size="lg" onPress={cancelModelDownload} testID="speech-model-cancel" />
          </View>
        ) : (
          <View style={styles.progress}>
            <Text style={[typeV2.meta, styles.centred, { color: model.status === 'missing' && model.error ? palette.red : palette.secondary }]} maxFontSizeMultiplier={1.4} testID="speech-model-note">
              {model.status === 'missing' && model.error
                ? model.error
                : cellular
                  ? t('recite.speechModel.oneTimeCellular', { size })
                  : t('recite.speechModel.oneTime', { size })}
            </Text>
            <PillButton
              title={cellular ? t('recite.speechModel.downloadCellular') : t('recite.speechModel.download', { size })}
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
