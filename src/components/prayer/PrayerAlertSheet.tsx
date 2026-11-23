import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PrayerAlert, PrayerName, REMINDER_OPTIONS, setPrayerAlert, usePrayerPrefs } from '../../lib/prayer/prefs';
import { TIME_LABELS } from '../../lib/prayer/times';
import { previewPrayerSound } from '../../lib/prayer/soundPreview';
import { athanEnabled } from '../../lib/athan';
import { useChosenAthanVoice } from './useChosenAthanVoice';
import { t } from '../../i18n';
import { forwardIcon } from '../../i18n/direction';

/** "Standard tone · 10 min before", "Athan", "Silent". Where the athan isn't offered, it reads as the standard tone. */
export function alertSummary(a: PrayerAlert): string {
  const sound =
    a.sound === 'silent'
      ? t('prayer.notifications.silent')
      : a.sound === 'athan' && athanEnabled()
        ? t('prayer.notifications.athan')
        : t('prayer.standardTone');
  return a.before > 0 ? t('prayer.notifications.summaryBefore', { sound, minutes: a.before }) : sound;
}

/**
 * One prayer's reminder and sound (and, set to the athan, the way to its voice). Opened from Prayer
 * notifications and from the prayer sheet's times.
 */
export function PrayerAlertSheet({
  prayer,
  onClose,
  onVoice,
}: {
  prayer: PrayerName | null;
  onClose: () => void;
  /** Opens the voice picker for this prayer. */
  onVoice: (prayer: PrayerName) => void;
}) {
  const { palette } = useTheme();
  const prefs = usePrayerPrefs();
  const [shown, setShown] = useState<PrayerName>('fajr');
  if (prayer && prayer !== shown) setShown(prayer);
  const a = prefs.alerts[shown];
  const athan = athanEnabled();
  const voice = useChosenAthanVoice(shown);
  const options: { id: 'standard' | 'athan' | 'silent'; label: string; detail?: string }[] = [
    { id: 'standard', label: t('prayer.standardTone') },
    ...(athan ? [{ id: 'athan' as const, label: t('prayer.notifications.athan'), detail: t('prayer.notifications.athanDetail') }] : []),
    { id: 'silent', label: t('prayer.notifications.silent'), detail: t('prayer.notifications.silentDetail') },
  ];
  // Where the athan isn't offered, a prayer saved with it shows (and plays) the standard tone.
  const current = a.sound === 'athan' && !athan ? 'standard' : a.sound;
  return (
    <Sheet
      visible={prayer != null}
      onClose={onClose}
      title={TIME_LABELS[shown].en}
      footer={{ label: t('common.done'), onPress: onClose, testID: 'prayer-alert-done' }}
      testID="prayer-alert-sheet"
    >
      <View style={styles.sheet}>
        <Text style={[typeV2.name, styles.sheetHeader, { color: palette.text }]} accessibilityRole="header">
          {t('prayer.notifications.reminderBefore')}
        </Text>
        <View style={styles.chips}>
          {REMINDER_OPTIONS.map((m) => {
            const selected = a.before === m;
            return (
              <Tap
                key={m}
                onPress={() => setPrayerAlert(shown, { before: m })}
                style={[
                  styles.chip,
                  selected
                    ? { backgroundColor: palette.primary, borderColor: palette.primary }
                    : { borderColor: palette.outline },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                testID={`prayer-before-${m}`}
              >
                <Text style={[typeV2.button, { color: selected ? palette.onPrimary : palette.text }]} maxFontSizeMultiplier={1.3}>
                  {m === 0 ? t('prayer.notifications.off') : t('prayer.notifications.minutes', { minutes: m })}
                </Text>
              </Tap>
            );
          })}
        </View>
        <Text style={[typeV2.name, styles.sheetHeader, { color: palette.text }]} accessibilityRole="header">
          {t('prayer.notifications.sound')}
        </Text>
        {options.map((o) => {
          const selected = current === o.id;
          return (
            <Tap
              key={o.id}
              // Picks it and plays it, as iOS's own sound settings do (again on
              // each tap). Silent plays nothing.
              onPress={() => {
                setPrayerAlert(shown, { sound: o.id });
                // The athan is listened to in its voice picker; the others play here.
                if (o.id !== 'athan') void previewPrayerSound(o.id);
              }}
              style={styles.option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityHint={o.id === 'standard' ? t('prayer.notifications.playsSound') : undefined}
              testID={`prayer-sound-${o.id}`}
            >
              <View style={styles.rowText}>
                <Text style={[typeV2.menu, { color: palette.text }]}>{o.label}</Text>
                {o.detail ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{o.detail}</Text> : null}
              </View>
              {selected ? <Ionicons name="checkmark" size={22} color={palette.accentText} /> : null}
            </Tap>
          );
        })}
        {current === 'athan' ? (
          <Tap
            onPress={() => onVoice(shown)}
            style={styles.option}
            accessibilityRole="button"
            accessibilityLabel={`${t('prayer.notifications.voice')}: ${voice?.name ?? t('prayer.notifications.chooseVoice')}`}
            testID="prayer-athan-voice"
          >
            <View style={styles.rowText}>
              <Text style={[typeV2.menu, { color: palette.text }]}>{t('prayer.notifications.voice')}</Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]}>{voice?.name ?? t('prayer.notifications.chooseVoice')}</Text>
            </View>
            <Ionicons name={forwardIcon()} size={18} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rowText: { flex: 1, minWidth: 0 },
  sheet: { paddingHorizontal: layoutV2.gutter, paddingBottom: 8 },
  sheetHeader: { marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8 },
});
