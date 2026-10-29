import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { TopBar } from '../../components/v2/TopBar';
import { Tap } from '../../components/v2/Tap';
import { ActionSheet, type SheetAction } from '../../components/v2/ActionSheet';
import { GroupedSection } from '../../components/plan/Grouped';
import { layoutV2, typeV2 } from '../../theme/v2';
import {
  BUNDLED_ATHAN_VOICE_ID,
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
import { athanChoices, athanVoicesFor, chosenAthanVoiceId, withAthanVoice } from '../../lib/prayer/athanChoice';
import { useAthanPreview } from '../../components/prayer/useAthanPreview';

export const RIGHTS_EMAIL = 'support@revisely.app';

/** mailto: for "Report a rights issue" about a voice. */
export function rightsIssueUrl(voice: AthanVoice): string {
  const subject = `Athan voice rights issue: ${voice.name} (${voice.id})`;
  const body = `Voice: ${voice.name} (${voice.id})\nCredit: ${voice.credit}\n\nWhat's the issue?\n`;
  return `mailto:${RIGHTS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Settings → Prayer → Athan voice: the voice a prayer set to Athan plays at its
 * time (Prayer notifications sets which prayers do). One tap chooses a voice for
 * every prayer and downloads it (a prayer plays the bundled voice until then);
 * Fajr takes the voice's Fajr athan when it has one. Each voice can be listened
 * to; its credit is shown, and its menu has the licence, where it's from and
 * "Report a rights issue". Voices without a notification clip yet are listed to
 * listen to. iPhone only (Android plays the bundled voice).
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
  const chosen = chosenAthanVoiceId(prefs.alerts) ?? BUNDLED_ATHAN_VOICE_ID;

  const choose = (voice: AthanVoice) => {
    setPrayerPrefs({ alerts: withAthanVoice(prefs.alerts, voice, voices) });
    // A prayer plays the bundled voice until its own has downloaded.
    for (const id of new Set(Object.values(athanVoicesFor(voice, voices)))) {
      if (id) downloadAthanVoice(id).catch(() => undefined);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]} testID="athan-voice-screen">
      <View style={{ paddingTop: insets.top }}>
        <TopBar title="Athan voice" onBack={() => navigation.goBack()} separator />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {error || (loading && choices.length <= 1) ? (
          <Text style={[typeV2.meta, styles.status, { color: palette.secondary }]} testID="athan-catalog-status">
            {error ?? 'Loading voices…'}
          </Text>
        ) : null}
        <GroupedSection
          header="Voices"
          footer="Plays at the time of each prayer set to Athan in Prayer notifications. Fajr has its own athan where the voice has one."
        >
          {choices.map((v) => (
            <VoiceRow
              key={v.id}
              voice={v}
              fajr={fajrVariant(v, voices)}
              selected={v.id === chosen}
              playing={preview.playing === v.id}
              onPress={() => choose(v)}
              onPreview={() => preview.toggle(v)}
              onMenu={() => setMenu(v)}
            />
          ))}
        </GroupedSection>
        {listenOnly.length > 0 ? (
          <GroupedSection header="Listen" footer="Not yet available as a prayer’s sound.">
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
  if (!choosable) return voice.fajr ? 'Fajr athan · listen only' : 'Listen only';
  switch (state.status) {
    case 'bundled':
      return 'Built in';
    case 'ready':
      return 'Downloaded';
    case 'downloading':
      return `Downloading ${Math.round(state.progress * 100)}%`;
    default: {
      if (state.error) return state.error;
      const size = formatAthanSize(voice.clip?.bytes ?? null);
      return size ? `Downloads when chosen · ${size}` : 'Downloads when chosen';
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
  const meta = [stateLine(voice, state, choosable), fajr && fajr.id !== voice.id ? 'With its Fajr athan' : null]
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
        accessibilityLabel={playing ? `Stop ${voice.name}` : `Listen to ${voice.name}`}
        testID={`athan-preview-${voice.id}`}
      >
        <Ionicons name={playing ? 'stop-circle-outline' : 'play-circle-outline'} size={28} color={palette.text} />
      </Tap>
      <Tap
        onPress={onMenu}
        hitSlop={6}
        style={styles.icon}
        accessibilityRole="button"
        accessibilityLabel={`More about ${voice.name}`}
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
  const state = useAthanVoiceState(shown?.id ?? BUNDLED_ATHAN_VOICE_ID);
  if (!shown) return null;
  const actions: SheetAction[] = [];
  if (shown.licenceUrl) {
    const url = shown.licenceUrl;
    actions.push({ key: 'licence', label: `Licence: ${shown.licence}`, icon: 'document-text-outline', onPress: () => Linking.openURL(url) });
  }
  if (shown.sourceUrl) {
    const url = shown.sourceUrl;
    actions.push({ key: 'source', label: 'Where it’s from', icon: 'open-outline', onPress: () => Linking.openURL(url) });
  }
  if (state.status === 'downloading') {
    actions.push({ key: 'cancel', label: 'Stop downloading', icon: 'close-circle-outline', onPress: () => cancelAthanDownload(shown.id) });
  }
  if (state.status === 'ready' && !shown.bundled) {
    actions.push({
      key: 'delete',
      label: 'Remove download',
      icon: 'trash-outline',
      destructive: true,
      subtitle: 'Prayers set to it play the built-in voice until it downloads again',
      onPress: () => deleteAthanVoice(shown.id),
    });
  }
  actions.push({
    key: 'report',
    label: 'Report a rights issue',
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
