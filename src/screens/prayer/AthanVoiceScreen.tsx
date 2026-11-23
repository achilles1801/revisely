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
  formatAthanSize,
  useAthanCatalog,
  useAthanVoiceState,
  type AthanVoice,
} from '../../lib/athan';
import { setPrayerPrefs, usePrayerPrefs } from '../../lib/prayer/prefs';
import { TIME_LABELS } from '../../lib/prayer/times';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { t } from '../../i18n';
import { athanChoices, athanDownloadsFor, chosenAthanVoiceIds, withAthanVoice } from '../../lib/prayer/athanChoice';
import { useAthanPreview } from '../../components/prayer/useAthanPreview';

/**
 * Settings → Prayer → Athan voice (Revisely Dev, iPhone): the voice a prayer set to Athan plays at its
 * time. One tap chooses a voice for every prayer, or for the one prayer the picker was opened from
 * (which is then set to Athan), and downloads its clip; a prayer plays the standard tone until then.
 * Fajr takes the voice's Fajr athan when it has one; a Fajr athan listed by itself is Fajr's alone.
 * One list (Majd, Nov 23 2026), each row the voice's name and its clip's size, with a play button to
 * listen and a menu (where it's from, its download).
 */
export default function AthanVoiceScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const prefs = usePrayerPrefs();
  const { voices, loading, error } = useAthanCatalog();
  const preview = useAthanPreview();
  const [menu, setMenu] = useState<AthanVoice | null>(null);
  // Opened from one prayer's sound (Prayer notifications): the choice is that prayer's alone.
  const prayer = useRoute<RouteProp<HomeStackParamList, 'AthanVoice'>>().params?.prayer;
  const choices = athanChoices(voices, prayer);
  const chosen = chosenAthanVoiceIds(prefs.alerts, voices, prayer);

  const choose = (voice: AthanVoice) => {
    setPrayerPrefs({ alerts: withAthanVoice(prefs.alerts, voice, voices, prayer) });
    // A prayer plays the standard tone until its voice has downloaded.
    for (const id of athanDownloadsFor(voice, voices, prayer)) downloadAthanVoice(id).catch(() => undefined);
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
        <GroupedSection header={t('prayer.athan.voices')} footer={t('prayer.athan.footer')}>
          {choices.map((v) => (
            <VoiceRow
              key={v.id}
              voice={v}
              selected={chosen.has(v.id)}
              playing={preview.playing === v.id}
              onPress={() => choose(v)}
              onPreview={() => preview.toggle(v)}
              onMenu={() => setMenu(v)}
            />
          ))}
        </GroupedSection>
      </ScrollView>
      <VoiceMenu voice={menu} onClose={() => setMenu(null)} />
    </View>
  );
}

/** A row's second line: the clip's size ("338 KB"); its progress while it downloads; why a download failed. */
function stateLine(voice: AthanVoice, state: ReturnType<typeof useAthanVoiceState>): string {
  if (state.status === 'downloading') return t('prayer.athan.downloading', { percent: Math.round(state.progress * 100) });
  if (state.status === 'missing' && state.error) return state.error;
  return formatAthanSize(voice.clip?.bytes ?? null) ?? '';
}

function VoiceRow({
  voice,
  selected,
  playing,
  onPress,
  onPreview,
  onMenu,
}: {
  voice: AthanVoice;
  selected: boolean;
  playing: boolean;
  onPress: () => void;
  onPreview: () => void;
  onMenu: () => void;
}) {
  const { palette } = useTheme();
  const state = useAthanVoiceState(voice.id);
  const failed = state.status === 'missing' && !!state.error;
  const meta = stateLine(voice, state);
  return (
    <View style={styles.row} testID={`athan-voice-${voice.id}`}>
      <Tap
        onPress={onPress}
        style={styles.choose}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={meta ? `${voice.name}. ${meta}` : voice.name}
        testID={`athan-choose-${voice.id}`}
      >
        <View style={styles.check}>{selected ? <Ionicons name="checkmark" size={22} color={palette.accentText} /> : null}</View>
        <View style={styles.text}>
          <Text style={[typeV2.body, styles.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            {voice.name}
          </Text>
          {meta ? (
            <Text style={[typeV2.meta, { color: failed ? palette.red : palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Tap>
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

/** A voice's credit and links, and its download. */
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
  row: { flexDirection: 'row', alignItems: 'center', paddingEnd: layoutV2.gutter - 6 },
  choose: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 8,
    paddingStart: layoutV2.gutter,
  },
  check: { width: 30 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontWeight: '600' },
  icon: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
