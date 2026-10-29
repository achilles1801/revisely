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

/**
 * Friday on Home: a post suggesting Surah Al-Kahf. Read opens it; "Mark as
 * read" asks how long it took (a sheet) and logs a reading session; ⋯ hides it
 * for today. Once read, its mark is done.
 */
export function KahfPost({
  state,
  saving = false,
  onRead,
  onMarkRead,
  onDismiss,
}: {
  state: 'prompt' | 'done';
  saving?: boolean;
  onRead: () => void;
  onMarkRead: (minutes: number) => void;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const pages = kahfPages();
  const range = `pages ${pages[0]}–${pages[pages.length - 1]}`;
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
        meta="Friday"
        onMenu={done ? undefined : () => setMenuOpen(true)}
        menuLabel="Al-Kahf options"
        testID="kahf-post"
        footer={
          done ? (
            <PillButton title="Open" variant="outline" onPress={onRead} accessibilityLabel="Open Surah Al-Kahf" />
          ) : (
            <>
              <PillButton title="Read" onPress={onRead} accessibilityLabel="Read Surah Al-Kahf" testID="kahf-read" />
              <PillButton
                title={saving ? 'Saving…' : 'Mark as read'}
                variant="outline"
                onPress={() => setPicking(true)}
                disabled={saving}
                accessibilityLabel="Mark Surah Al-Kahf as read"
                testID="kahf-mark"
              />
            </>
          )
        }
      >
        <RowText>{done ? 'Read today.' : "It's Friday. Read Surah Al-Kahf."}</RowText>
        <RowText secondary>{done ? `Saved as a reading session, ${range}.` : `The whole surah, ${range}.`}</RowText>
      </ThreadRow>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Al-Kahf"
        actions={[{ key: 'hide', label: 'Not today', icon: 'eye-off-outline', onPress: onDismiss }]}
      />
      <ActionSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="How long did it take?"
        message={`Saved as a reading session of Al-Kahf (${range}).`}
        actions={KAHF_MINUTE_CHOICES.map((m) => ({
          key: `m${m}`,
          label: `${m} minutes`,
          icon: 'time-outline' as const,
          detail: m === KAHF_DEFAULT_MINUTES ? 'Usual' : undefined,
          onPress: () => onMarkRead(m),
        }))}
        testID="kahf-minutes"
      />
    </>
  );
}
