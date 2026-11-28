import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { KAHF_MINUTE_CHOICES, KAHF_DEFAULT_MINUTES, kahfPages } from '../../../lib/kahf';
import { NBSP } from '../../../lib/passages';
import { arabicV2, typeV2 } from '../../../theme/v2';
import { ActionSheet } from '../../v2/ActionSheet';
import { Mark } from '../../v2/Mark';
import { Tap } from '../../v2/Tap';
import { RowText, ThreadRow } from '../../v2/ThreadRow';
import { arabicLabelLines } from '../../../lib/platformUi';
import { t } from '../../../i18n';

/** How far the card's line grows with Dynamic Type before it wraps (as Today's lines). */
const LINE_MAX_SCALE = 1.6;

/**
 * The Islamic Friday on Home (Thursday's maghrib to Friday's, KAHF-1): one quiet row suggesting Surah Al-Kahf, in the
 * calmer Home's own words (Majd, Nov 27 2026: "i'm open to redesigning the surah kahf card"; board:
 * ~/Documents/revisely-today-mocks/kahf-v2/). A tap on the row, or on "Read" ending its grey line, opens it (KAHF-2);
 * the check beside ⋯ marks it read, asking how long it took (a sheet), and logs a reading session; ⋯ hides it until
 * Friday's maghrib (KAHF-3). No buttons: Home's one solid button stays the Today post's (HOME-5). Once read, its mark is
 * the check and the line says so.
 */
export function KahfPost({
  state,
  eve = false,
  saving = false,
  onRead,
  onMarkRead,
  onDismiss,
}: {
  state: 'prompt' | 'done';
  /** Thursday evening, after maghrib: Friday has begun but the revision day is still Thursday's. */
  eve?: boolean;
  saving?: boolean;
  onRead: () => void;
  onMarkRead: (minutes: number) => void;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const n = kahfPages().length;
  const done = state === 'done';
  const line = done ? t('home.kahf.doneFriday') : eve ? t('home.kahf.fridayBegan', { n }) : t('home.kahf.itsFriday', { n });
  const link = done ? t('home.kahf.open') : t('home.kahf.read');

  return (
    <>
      <ThreadRow
        mark={<Mark label="١٨" arabic done={done} />}
        name="Al-Kahf"
        nameAfter={
          <Text style={[arabicV2(16), { color: palette.secondary, marginLeft: 6 }]} accessibilityLanguage="ar" numberOfLines={arabicLabelLines}>
            الكهف
          </Text>
        }
        meta={t('home.kahf.friday')}
        figure={
          done ? undefined : (
            <Tap
              onPress={() => setPicking(true)}
              disabled={saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('home.kahf.markReadLabel')}
              accessibilityState={{ disabled: saving, busy: saving }}
              style={[styles.check, { borderColor: palette.outline, opacity: saving ? 0.5 : 1 }]}
              testID="kahf-mark"
            >
              <Ionicons name="checkmark" size={18} color={palette.secondary} />
            </Tap>
          )
        }
        onMenu={done ? undefined : () => setMenuOpen(true)}
        menuLabel={t('home.kahf.options')}
        onPress={onRead}
        testID="kahf-post"
      >
        <Tap
          onPress={onRead}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${line} ${done ? t('home.kahf.openLabel') : t('home.kahf.readLabel')}`}
          style={styles.line}
          testID="kahf-read"
        >
          <RowText secondary>
            <Text maxFontSizeMultiplier={LINE_MAX_SCALE} testID="kahf-line">
              {line}
            </Text>
            {NBSP}
            {NBSP}
            <Text maxFontSizeMultiplier={LINE_MAX_SCALE} style={[styles.link, { color: palette.accentText }]}>
              {link}
            </Text>
          </RowText>
        </Tap>
      </ThreadRow>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Al-Kahf"
        actions={[{ key: 'hide', label: t('home.kahf.notToday'), icon: 'eye-off-outline', onPress: onDismiss }]}
      />
      <ActionSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t('home.kahf.howLong')}
        message={t('home.kahf.savedOf', { n })}
        actions={KAHF_MINUTE_CHOICES.map((m) => ({
          key: `m${m}`,
          label: t('home.kahf.minutes', { m }),
          icon: 'time-outline' as const,
          detail: m === KAHF_DEFAULT_MINUTES ? t('home.kahf.usual') : undefined,
          onPress: () => onMarkRead(m),
        }))}
        testID="kahf-minutes"
      />
    </>
  );
}

const styles = StyleSheet.create({
  // A ring the size of a tap target's heart, its check centred by the box (design: a mark inside a ring).
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  line: { alignSelf: 'flex-start' },
  link: { ...typeV2.body, fontWeight: '600' },
});
