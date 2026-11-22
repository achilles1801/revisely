import React, { useState } from 'react';
import { Text } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { KAHF_MINUTE_CHOICES, KAHF_DEFAULT_MINUTES, kahfPages } from '../../../lib/kahf';
import { arabicV2 } from '../../../theme/v2';
import { ActionSheet } from '../../v2/ActionSheet';
import { Mark } from '../../v2/Mark';
import { PillButton } from '../../v2/PillButton';
import { RowText, ThreadRow } from '../../v2/ThreadRow';
import { arabicLabelLines } from '../../../lib/platformUi';
import { t } from '../../../i18n';

/**
 * The Islamic Friday on Home (Thursday's maghrib to Friday's, KAHF-1): a post
 * suggesting Surah Al-Kahf. Read opens it; "Mark as read" asks how long it took
 * (a sheet) and logs a reading session; ⋯ hides it until Friday's maghrib. Once
 * read, its mark is done.
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
  const pages = kahfPages();
  const range = t('home.kahf.range', { from: pages[0], to: pages[pages.length - 1] });
  const done = state === 'done';

  return (
    <>
      <ThreadRow
        mark={<Mark label="١٨" arabic done={done} />}
        name="Al-Kahf"
        nameAfter={
          <Text style={[arabicV2(16), { color: palette.secondary, marginLeft: 6, lineHeight: 20 }]} accessibilityLanguage="ar" numberOfLines={arabicLabelLines}>
            الكهف
          </Text>
        }
        meta={t('home.kahf.friday')}
        onMenu={done ? undefined : () => setMenuOpen(true)}
        menuLabel={t('home.kahf.options')}
        testID="kahf-post"
        footer={
          done ? (
            <PillButton title={t('home.kahf.open')} variant="outline" onPress={onRead} accessibilityLabel={t('home.kahf.openLabel')} />
          ) : (
            <>
              <PillButton title={t('home.kahf.read')} onPress={onRead} accessibilityLabel={t('home.kahf.readLabel')} testID="kahf-read" />
              <PillButton
                title={saving ? t('common.saving') : t('home.kahf.markRead')}
                variant="outline"
                onPress={() => setPicking(true)}
                disabled={saving}
                accessibilityLabel={t('home.kahf.markReadLabel')}
                testID="kahf-mark"
              />
            </>
          )
        }
      >
        <RowText>{done ? t('home.kahf.doneFriday') : eve ? t('home.kahf.fridayBegan') : t('home.kahf.itsFriday')}</RowText>
        <RowText secondary>{done ? t('home.kahf.saved', { range }) : t('home.kahf.whole', { range })}</RowText>
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
        message={t('home.kahf.savedOf', { range })}
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
