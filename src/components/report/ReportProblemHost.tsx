import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { PillButton } from '../v2/PillButton';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { captureScreen, sendProblemReport } from '../../lib/sentry';
import {
  closeReportProblem,
  endReportCapture,
  removeReportShot,
  setReportText,
  startReportCapture,
  useReportState,
} from '../../lib/report/state';
import { t } from '../../i18n';

/** How long the capture bar has been gone before the picture is taken, so it isn't in it. */
export const CAPTURE_DELAY_MS = 150;
export const REPORT_MAX_LENGTH = 2000;

/**
 * Settings → Report a problem (SET-2, SET-3; Majd, Nov 22 2026: "fix the terrible ui for the report a
 * problem"): the app's own form, in its own design, in place of Sentry's white one with its logo. Mounted once
 * over the main screens, so "Add a screenshot" can put the form away, let the user go to the screen with the
 * problem, and bring the form back with the picture. The report still goes to Sentry (lib/sentry).
 */
export function ReportProblemHost() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { phase, text, shot, shotFailed } = useReportState();
  // The bar is taken off the screen a moment before the capture.
  const [taking, setTaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  // Signing out unmounts the main screens: nothing typed is kept for the next account.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      closeReportProblem();
    },
    [],
  );

  const ready = text.trim().length > 0;
  const send = () => {
    const message = text.trim();
    if (!message) return;
    sendProblemReport(message, shot);
    closeReportProblem();
    Alert.alert(t('settings.report.thanks'), t('settings.report.thanksBody'));
  };

  const capture = () => {
    if (taking) return;
    setTaking(true);
    timer.current = setTimeout(async () => {
      timer.current = null;
      const taken = await captureScreen();
      setTaking(false);
      endReportCapture(taken, !taken);
    }, CAPTURE_DELAY_MS);
  };

  return (
    <>
      <Sheet
        visible={phase === 'form'}
        onClose={closeReportProblem}
        onShow={() => {
          if (!shot && !shotFailed) inputRef.current?.focus();
        }}
        keyboard
        title={t('settings.report.title')}
        left={{ label: t('common.cancel'), onPress: closeReportProblem, testID: 'report-sheet-cancel' }}
        right={{ label: t('settings.report.send'), onPress: send, strong: true, disabled: !ready, testID: 'report-sheet-save' }}
        testID="report-sheet"
      >
        <View style={styles.body}>
          <Text style={[typeV2.meta, { color: palette.secondary }]}>{t('settings.report.message')}</Text>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setReportText}
            placeholder={t('settings.report.placeholder')}
            placeholderTextColor={palette.secondary}
            maxLength={REPORT_MAX_LENGTH}
            multiline
            textAlignVertical="top"
            selectionColor={palette.accentText}
            style={[typeV2.body, styles.input, { color: palette.text, backgroundColor: palette.fill }]}
            accessibilityLabel={t('settings.report.title')}
            testID="report-sheet-input"
          />
          {shot ? (
            <View style={styles.row} testID="report-sheet-shot">
              <Ionicons name="image-outline" size={22} color={palette.text} />
              <Text style={[typeV2.body, styles.rowLabel, { color: palette.text }]}>{t('settings.report.shotAdded')}</Text>
              <Tap
                onPress={removeReportShot}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('settings.report.shotRemoveLabel')}
                testID="report-sheet-shot-remove"
              >
                <Text style={[typeV2.body, { color: palette.link }]}>{t('settings.report.shotRemove')}</Text>
              </Tap>
            </View>
          ) : (
            <Tap
              onPress={startReportCapture}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={t('settings.report.shotAdd')}
              accessibilityHint={t('settings.report.shotHint')}
              testID="report-sheet-shot-add"
            >
              <Ionicons name="camera-outline" size={22} color={palette.text} />
              <View style={styles.rowLabel}>
                <Text style={[typeV2.body, { color: palette.text }]}>{t('settings.report.shotAdd')}</Text>
                <Text style={[typeV2.meta, { color: shotFailed ? palette.red : palette.secondary }]}>
                  {shotFailed ? t('settings.report.shotFailed') : t('settings.report.shotHint')}
                </Text>
              </View>
            </Tap>
          )}
        </View>
      </Sheet>
      {phase === 'capture' && !taking ? (
        <View pointerEvents="box-none" style={[styles.barWrap, { bottom: insets.bottom + 16 }]}>
          <View
            style={[styles.bar, { backgroundColor: palette.sheet, borderColor: palette.outline }]}
            testID="report-capture-bar"
          >
            <PillButton
              title={t('settings.report.capture')}
              icon="camera-outline"
              size="md"
              onPress={capture}
              testID="report-capture"
            />
            <Tap
              onPress={() => endReportCapture(null)}
              hitSlop={8}
              style={[styles.close, { backgroundColor: palette.fill }]}
              accessibilityRole="button"
              accessibilityLabel={t('settings.report.captureCancel')}
              testID="report-capture-cancel"
            >
              <Ionicons name="close" size={20} color={palette.text} />
            </Tap>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 4, gap: 12 },
  // A minimum, not a height: the field grows with its text and with Dynamic Type.
  input: { borderRadius: radiusV2.media, paddingHorizontal: 14, paddingVertical: 12, minHeight: 140 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 4 },
  rowLabel: { flex: 1 },
  barWrap: { position: 'absolute', start: 0, end: 0, alignItems: 'center', paddingHorizontal: layoutV2.gutter },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderRadius: radiusV2.full,
    borderWidth: layoutV2.hairline,
  },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
