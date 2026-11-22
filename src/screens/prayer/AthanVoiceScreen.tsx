import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { TopBar } from '../../components/v2/TopBar';
import { Tap } from '../../components/v2/Tap';
import { ActionSheet, type SheetAction } from '../../components/v2/ActionSheet';
import { GroupedSection } from '../../components/plan/Grouped';
import { layoutV2, typeV2 } from '../../theme/v2';
import {
  cancelAthanDownload,
  deleteAthanVoice,
  downloadAthanVoice,
  fajrVariant,
  formatAthanSize,
  useAthanCatalog,
  useAthanVoiceState,
  type AthanVoice,
} from '../../lib/athan';
import { setPrayerPrefs, usePrayerPrefs } from '../../lib/prayer/prefs';
import { TIME_LABELS } from '../../lib/prayer/times';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { t } from '../../i18n';
import { athanChoices, athanVoiceFor, athanVoicesFor, chosenAthanVoiceId, withAthanVoice } from '../../lib/prayer/athanChoice';
import { useAthanPreview } from '../../components/prayer/useAthanPreview';

export const RIGHTS_EMAIL = 'support@revisely.app';

/** mailto: for "Report a rights issue" about a voice. */
export function rightsIssueUrl(voice: AthanVoice): string {
  const subject = `Athan voice rights issue: ${voice.name} (${voice.id})`; // i18n-ignore (an email to support, in English)
  const body = `Voice: ${voice.name} (${voice.id})\nCredit: ${voice.credit}\n\nWhat's the issue?\n`; // i18n-ignore (the same email)
  return `mailto:${RIGHTS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Settings → Prayer → Athan voice (Revisely Dev, iPhone): the voice a prayer set to Athan plays at its
 * time. One tap chooses a voice for every prayer, or for the one prayer the picker was opened from
 * (which is then set to Athan), and downloads its clip; a prayer plays the standard tone until then.
 * Fajr takes the voice's Fajr athan when it has one. Each voice can be listened to; its credit is
 * shown, and its menu has the licence, where it's from and "Report a rights issue".
 */
export default function AthanVoiceScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const prefs = usePrayerPrefs();
  const { voices, loading, error } = useAthanCatalog();
  const preview = useAthanPreview();
  const [menu, setMenu] = useState<AthanVoice | null>(null);
  const { choices, listenOnly } = athanChoices(voices);
  // Opened from one prayer's sound (Prayer notifications): the choice is that prayer's alone.
  const prayer = useRoute<RouteProp<HomeStackParamList, 'AthanVoice'>>().params?.prayer;
  const chosen = chosenAthanVoiceId(prefs.alerts, voices, prayer);

  const choose = (voice: AthanVoice) => {
    setPrayerPrefs({ alerts: withAthanVoice(prefs.alerts, voice, voices, prayer) });
    // A prayer plays the standard tone until its voice has downloaded.
    const ids = prayer ? [athanVoiceFor(prayer, voice, voices)] : Object.values(athanVoicesFor(voice, voices));
    for (const id of new Set(ids)) downloadAthanVoice(id).catch(() => undefined);
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]} testID="athan-voice-screen">
      <View style={{ paddingTop: insets.top }}>
        <TopBar title={prayer ? t('prayer.athan.titleFor', { name: TIME_LABELS[prayer].en }) : t('prayer.athan.title')} onBack={() => navigation.goBack()} separator />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {error || (loading && choices.length === 0) ? (
          <Text style={[typeV2.meta, styles.status, { color: palette.secondary }]} testID="athan-catalog-status">
            {error ?? t('prayer.athan.loading')}
          </Text>
        ) : null}
        <GroupedSection
          header={t('prayer.athan.voices')}
          footer={prayer ? t('prayer.athan.footerOne', { name: TIME_LABELS[prayer].en }) : t('prayer.athan.footerAll')}
        >
          {choices.map((v) => (
            <VoiceRow
              key={v.id}
              voice={v}
              fajr={prayer && prayer !== 'fajr' ? null : fajrVariant(v, voices)}
              selected={v.id === chosen}
              playing={preview.playing === v.id}
              onPress={() => choose(v)}
              onPreview={() => preview.toggle(v)}
              onMenu={() => setMenu(v)}
            />
          ))}
        </GroupedSection>
        {listenOnly.length > 0 ? (
          <GroupedSection header={t('prayer.athan.listen')} footer={t('prayer.athan.listenFooter')}>
            {listenOnly.map((v) => (
              <VoiceRow
                key={v.id}
                voice={v}
                fajr={null}
                playing={preview.playing === v.id}
                onPreview={() => preview.toggle(v)}
                onMenu={() => setMenu(v)}
              />
            ))}
          </GroupedSection>
        ) : null}
      </ScrollView>
      <VoiceMenu voice={menu} onClose={() => setMenu(null)} />
    </View>
  );
}

function stateLine(voice: AthanVoice, state: ReturnType<typeof useAthanVoiceState>, choosable: boolean): string {
  if (!choosable) return voice.fajr ? t('prayer.athan.fajrListenOnly') : t('prayer.athan.listenOnly');
  switch (state.status) {
    case 'ready':
      return t('prayer.athan.downloaded');
    case 'downloading':
      return t('prayer.athan.downloading', { percent: Math.round(state.progress * 100) });
    default: {
      if (state.error) return state.error;
      const size = formatAthanSize(voice.clip?.bytes ?? null);
      return size ? t('prayer.athan.downloadsWhenChosenSize', { size }) : t('prayer.athan.downloadsWhenChosen');
    }
  }
}

function VoiceRow({
  voice,
  fajr,
  selected = false,
  playing,
  onPress,
  onPreview,
  onMenu,
}: {
  voice: AthanVoice;
  /** Its style's Fajr athan, used for Fajr. */
  fajr: AthanVoice | null;
  selected?: boolean;
  playing: boolean;
  /** Choosing it (absent: listen only). */
  onPress?: () => void;
  onPreview: () => void;
  onMenu: () => void;
}) {
  const { palette } = useTheme();
  const state = useAthanVoiceState(voice.id);
  const choosable = onPress != null;
  const failed = state.status === 'missing' && !!state.error;
  const meta = [stateLine(voice, state, choosable), fajr && fajr.id !== voice.id ? t('prayer.athan.withFajr') : null]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      {choosable ? (
        <View style={styles.check}>
          {selected ? <Ionicons name="checkmark" size={22} color={palette.accentText} /> : null}
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={[typeV2.body, styles.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {voice.name}
        </Text>
        <Text style={[typeV2.meta, { color: failed ? palette.red : palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {meta}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
          {voice.credit}
        </Text>
      </View>
    </>
  );
  return (
    <View style={styles.row} testID={`athan-voice-${voice.id}`}>
      {choosable ? (
        <Tap
          onPress={onPress}
          style={styles.choose}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={`${voice.name}. ${meta}`}
          testID={`athan-choose-${voice.id}`}
        >
          {body}
        </Tap>
      ) : (
        <View style={styles.choose}>{body}</View>
      )}
      <Tap
        onPress={onPreview}
        hitSlop={6}
        style={styles.icon}
        accessibilityRole="button"
        accessibilityLabel={playing ? t('prayer.athan.stopLabel', { name: voice.name }) : t('prayer.athan.listenLabel', { name: voice.name })}
        testID={`athan-preview-${voice.id}`}
      >
        <Ionicons name={playing ? 'stop-circle-outline' : 'play-circle-outline'} size={28} color={palette.text} />
      </Tap>
      <Tap
        onPress={onMenu}
        hitSlop={6}
        style={styles.icon}
        accessibilityRole="button"
        accessibilityLabel={t('prayer.athan.moreLabel', { name: voice.name })}
        testID={`athan-menu-${voice.id}`}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={palette.secondary} />
      </Tap>
    </View>
  );
}

/** A voice's credit and links, its download, and the takedown path. */
function VoiceMenu({ voice, onClose }: { voice: AthanVoice | null; onClose: () => void }) {
  const [shown, setShown] = useState<AthanVoice | null>(voice);
  if (voice && voice !== shown) setShown(voice);
  const state = useAthanVoiceState(shown?.id ?? 'none');
  if (!shown) return null;
  const actions: SheetAction[] = [];
  if (shown.licenceUrl) {
    const url = shown.licenceUrl;
    actions.push({ key: 'licence', label: t('prayer.athan.licence', { licence: shown.licence }), icon: 'document-text-outline', onPress: () => Linking.openURL(url) });
  }
  if (shown.sourceUrl) {
    const url = shown.sourceUrl;
    actions.push({ key: 'source', label: t('prayer.athan.source'), icon: 'open-outline', onPress: () => Linking.openURL(url) });
  }
  if (state.status === 'downloading') {
    actions.push({ key: 'cancel', label: t('prayer.athan.stopDownloading'), icon: 'close-circle-outline', onPress: () => cancelAthanDownload(shown.id) });
  }
  if (state.status === 'ready') {
    actions.push({
      key: 'delete',
      label: t('prayer.athan.remove'),
      icon: 'trash-outline',
      destructive: true,
      subtitle: t('prayer.athan.removeDetail'),
      onPress: () => deleteAthanVoice(shown.id),
    });
  }
  actions.push({
    key: 'report',
    label: t('prayer.athan.report'),
    icon: 'flag-outline',
    onPress: () => Linking.openURL(rightsIssueUrl(shown)),
  });
  return (
    <ActionSheet
      visible={voice != null}
      onClose={onClose}
      title={shown.name}
      message={shown.credit}
      actions={actions}
      testID="athan-voice-menu"
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  status: { paddingHorizontal: layoutV2.gutter, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: layoutV2.gutter - 6 },
  choose: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: layoutV2.gutter,
  },
  check: { width: 30 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontWeight: '600' },
  icon: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
