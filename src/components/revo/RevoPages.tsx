import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { revoBackend } from '../../lib/revo/backend';
import { historyLine, historySections } from '../../lib/revo/history';
import type { RevoChat, RevoMemoryItem, RevoSettings } from '../../lib/revo/types';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { RevoMark } from './RevoMark';
import { RevoSubHeader } from './RevoParts';

export const REVO_PRIVACY_URL = 'https://revisely.app/privacy/#revo';

/** Conversations by day, with search; ✎ starts a new one. Days in review sit among them. */
export function RevoHistory({
  uid,
  onBack,
  onOpen,
  onNew,
}: {
  uid: string;
  onBack: () => void;
  onOpen: (chatId: string) => void;
  onNew: () => void;
}) {
  const { palette } = useTheme();
  const [chats, setChats] = useState<RevoChat[] | null>(null);
  const [q, setQ] = useState('');
  const backend = revoBackend();
  useEffect(() => backend.watchChats(uid, setChats), [backend, uid]);
  const sections = useMemo(() => historySections(chats ?? [], new Date(), q), [chats, q]);
  return (
    <View style={styles.fill}>
      <View style={styles.gutter}>
        <RevoSubHeader title="History" onBack={onBack} right={{ icon: 'create-outline', label: 'New conversation', onPress: onNew, testID: 'revo-new-chat' }} />
        <View style={[styles.search, { backgroundColor: palette.bubble }]}>
          <Ionicons name="search" size={20} color={palette.secondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search conversations"
            placeholderTextColor={palette.secondary}
            style={[styles.searchInput, { color: palette.text }]}
            returnKeyType="search"
            accessibilityLabel="Search conversations"
            testID="revo-history-search"
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.listPad} keyboardShouldPersistTaps="handled" testID="revo-history-list">
        {chats != null && sections.length === 0 ? (
          <Text style={[styles.empty, { color: palette.secondary }]} testID="revo-history-empty">
            {q ? 'No conversations match.' : 'Your conversations with Revo will be here.'}
          </Text>
        ) : null}
        {sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.secondary }]} accessibilityRole="header">
              {s.title}
            </Text>
            {s.chats.map((c, i) => (
              <Tap
                key={c.id}
                onPress={() => onOpen(c.id)}
                style={[styles.row, i > 0 && { borderTopColor: palette.separator, borderTopWidth: StyleSheet.hairlineWidth }]}
                accessibilityRole="button"
                accessibilityLabel={`${c.title}, ${historyLine(c)}`}
                testID={`revo-chat-${c.id}`}
              >
                <Ionicons name={c.kind === 'review' ? 'moon-outline' : 'chatbubble-ellipses-outline'} size={24} color={palette.secondary} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={2}>
                    {c.title}
                  </Text>
                  <Text style={[styles.rowLine, { color: palette.secondary }]}>{historyLine(c)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.secondary} />
              </Tap>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const sourceLine = (m: RevoMemoryItem, today: string) => {
  if (m.source === 'review') return 'From your Activity';
  if (m.day === today) return 'From a chat today';
  return `From a chat on ${new Date(`${m.day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
};

/** What Revo remembers: each item can be deleted; a switch turns memory off; Clear deletes all. */
export function RevoMemory({ uid, settings, today, onBack }: { uid: string; settings: RevoSettings; today: string; onBack: () => void }) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const backend = revoBackend();
  const [items, setItems] = useState<RevoMemoryItem[] | null>(null);
  const [memoryOn, setMemoryOn] = useState(settings.memoryOn);
  useEffect(() => backend.watchMemory(uid, setItems), [backend, uid]);
  useEffect(() => setMemoryOn(settings.memoryOn), [settings.memoryOn]);
  const clearAll = () =>
    Alert.alert('Clear Revo’s memory?', 'Everything Revo remembers is deleted. Your conversations stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          haptics.warning();
          void backend.clear('memory');
        },
      },
    ]);
  return (
    <View style={styles.fill}>
      <View style={styles.gutter}>
        <RevoSubHeader title="Memory" onBack={onBack} />
      </View>
      <ScrollView contentContainerStyle={styles.listPad}>
        <View style={[styles.switchCard, { backgroundColor: palette.bubble }]}>
          <View style={styles.rowText}>
            <Text style={[styles.switchTitle, { color: palette.text }]}>Let Revo remember</Text>
            <Text style={[styles.rowLine, { color: palette.secondary }]}>Short notes from your chats, so answers fit you</Text>
          </View>
          <Switch
            value={memoryOn}
            onValueChange={(v) => {
              setMemoryOn(v);
              backend.setOptions({ memoryOn: v }).catch(() => setMemoryOn(!v));
            }}
            trackColor={{ false: palette.switchOff, true: palette.primary }}
            thumbColor={palette.switchThumb}
            accessibilityLabel="Let Revo remember"
            testID="revo-memory-switch"
          />
        </View>
        <Text style={[styles.sectionTitle, styles.memoryHead, { color: palette.secondary }]} accessibilityRole="header">
          What Revo remembers
        </Text>
        {items != null && items.length === 0 ? (
          <Text style={[styles.empty, { color: palette.secondary }]} testID="revo-memory-empty">
            Nothing yet. Revo keeps a short note when something in a chat will help later.
          </Text>
        ) : null}
        {(items ?? []).map((m, i) => (
          <View key={m.id} style={[styles.memoryRow, i > 0 && { borderTopColor: palette.separator, borderTopWidth: StyleSheet.hairlineWidth }]} testID={`revo-memory-${m.id}`}>
            <View style={styles.rowText}>
              <Text style={[styles.memoryText, { color: palette.text }]}>{m.text}</Text>
              <Text style={[styles.rowLine, { color: palette.secondary }]}>{sourceLine(m, today)}</Text>
            </View>
            <Tap
              onPress={() => void backend.deleteMemory(uid, m.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Delete: ${m.text}`}
              testID={`revo-memory-delete-${m.id}`}
            >
              <Ionicons name="trash-outline" size={22} color={palette.secondary} />
            </Tap>
          </View>
        ))}
        {items != null && items.length > 0 ? (
          <Tap onPress={clearAll} style={styles.clear} accessibilityRole="button" testID="revo-memory-clear">
            <Text style={[styles.clearText, { color: palette.red }]}>Clear Revo’s memory</Text>
          </Tap>
        ) : null}
      </ScrollView>
    </View>
  );
}

const OPT_IN_ROWS: { icon: keyof typeof Ionicons.glyphMap; title: string; line: string }[] = [
  { icon: 'stats-chart-outline', title: 'Uses your totals', line: 'Coverage, consistency, weak spots and pace.' },
  { icon: 'lock-closed-outline', title: 'Your notes and recordings stay private', line: 'They’re only sent when you add one to a question.' },
  { icon: 'settings-outline', title: 'Off any time', line: 'Settings → Revo AI. Your history can be deleted there too.' },
];

/** The first time: what Revo is, what it is sent and what isn't, and how to turn it off. */
export function RevoOptIn({ onTurnOn, onNotNow, busy, error }: { onTurnOn: () => void; onNotNow: () => void; busy: boolean; error: string | null }) {
  const { palette } = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.optIn} testID="revo-optin">
      <RevoMark size={120} style={styles.optInMark} />
      <Text style={[styles.optInTitle, { color: palette.text }]} accessibilityRole="header">
        Meet Revo
      </Text>
      <Text style={[styles.optInBody, { color: palette.secondary }]}>
        Your revision coach. Ask about your progress, your weak spots or your plan, and get answers from your own Revisely data.
      </Text>
      <View style={styles.optInRows}>
        {OPT_IN_ROWS.map((r) => (
          <View key={r.title} style={styles.optInRow}>
            <View style={[styles.optInIcon, { backgroundColor: palette.bubble }]}>
              <Ionicons name={r.icon} size={22} color={palette.text} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.optInRowTitle, { color: palette.text }]}>{r.title}</Text>
              <Text style={[styles.optInRowLine, { color: palette.secondary }]}>{r.line}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.optInFoot}>
        {error ? (
          <Text style={[styles.rowLine, styles.center, { color: palette.red }]} testID="revo-optin-error">
            {error}
          </Text>
        ) : null}
        <PillButton title="Turn on Revo" onPress={onTurnOn} size="lg" busy={busy} testID="revo-turn-on" />
        <Tap onPress={onNotNow} style={styles.notNow} accessibilityRole="button" testID="revo-not-now">
          <Text style={[styles.notNowText, { color: palette.text }]}>Not now</Text>
        </Tap>
        <Text style={[styles.fine, { color: palette.secondary }]}>
          Revo AI can make mistakes.{' '}
          <Text style={{ color: palette.link }} onPress={() => void Linking.openURL(REVO_PRIVACY_URL)} accessibilityRole="link">
            How your data is used
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gutter: { paddingHorizontal: 16 },
  listPad: { paddingHorizontal: 16, paddingBottom: 24 },
  center: { textAlign: 'center' },
  search: { height: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8, marginTop: 8, marginBottom: 6 },
  searchInput: { flex: 1, fontSize: 17 },
  empty: { fontSize: 15, lineHeight: 21, paddingVertical: 16 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 17, lineHeight: 22 },
  rowLine: { fontSize: 14, lineHeight: 19 },
  switchCard: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  switchTitle: { fontSize: 17, fontWeight: '600' },
  memoryHead: { marginTop: 24, marginBottom: 6 },
  memoryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  memoryText: { fontSize: 17, lineHeight: 23 },
  clear: { alignItems: 'center', paddingVertical: 24 },
  clearText: { fontSize: 17, fontWeight: '600' },
  optIn: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 12, flexGrow: 1 },
  optInMark: { alignSelf: 'center', marginBottom: 20 },
  optInTitle: { fontSize: 30, fontWeight: '700', textAlign: 'center' },
  optInBody: { fontSize: 17, lineHeight: 23, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
  optInRows: { gap: 18, marginTop: 28 },
  optInRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  optInIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  optInRowTitle: { fontSize: 17, fontWeight: '600' },
  optInRowLine: { fontSize: 15, lineHeight: 20 },
  optInFoot: { marginTop: 'auto', paddingTop: 28, gap: 6 },
  notNow: { alignItems: 'center', paddingVertical: 12 },
  notNowText: { fontSize: 17, fontWeight: '600' },
  fine: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
