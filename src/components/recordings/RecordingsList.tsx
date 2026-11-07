import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import {
  deleteRecording,
  listRecordings,
  pageAt,
  RecordingKind,
  RecordingMeta,
} from "../../lib/recordings";
import { formatRecordingTime } from "../../lib/recordingFormat";
import { logger } from "../../lib/logger";
import { useKeepScreenOn } from "../../hooks/useKeepScreenOn";
import { useRecordingPlayback } from "../../hooks/useRecordingPlayback";
import { useHaptics } from "../../design/haptics";
import { playedFraction } from "../../lib/waveform";
import { placeOfPage, spokenText } from "../../lib/passages";
import { layoutV2, typeV2 } from "../../theme/v2";
import { Tap } from "../v2/Tap";
import { ActionSheet } from "../v2/ActionSheet";
import { AudioWaveform } from "../v2/AudioWaveform";
import { SwipeRow } from "../v2/SwipeRow";

interface RecordingsListProps {
  day: string;
  kind?: RecordingKind;
  onChanged?: () => void;
  /** Shown above the list, only when there are recordings. */
  header?: React.ReactNode;
  /** Bump to reload (e.g. after the screen deleted a session's recordings). */
  reloadKey?: number;
  /** A recording to highlight (just saved). */
  highlightId?: string;
  /** "›": Listen back, the recording over its pages, from the start. */
  onOpen?: (recording: RecordingMeta) => void;
  /** Shown when the day has none; null shows nothing (inside a block, where the block says so). */
  emptyText?: string | null;
  /**
   * `block`: inside an Activity day block (mock d1, gap audit §4): the bubble across the column with no
   * name line, no gutter and no "›" (Listen back is in its hold menu), the chips with the time on their
   * right. `list` (the default): the day's own list, as before.
   */
  variant?: "list" | "block";
}

const KIND_LABEL: Record<RecordingKind, string> = {
  revision: "Revision",
  reading: "Reading",
};

/**
 * A day's recordings as voice bubbles (Variant B): the name and time of day,
 * then a rounded bubble with play / pause, the voice bars (tap or drag to
 * seek) and the time, with "›" beside it to Listen back (the recording over its
 * pages); under it, the pages as chips: a tap plays from where that page was
 * reached, and the page playing is filled. A long press on a recording opens
 * its menu (Delete). None: one quiet line.
 */
export function RecordingsList({
  day,
  kind,
  onChanged,
  header,
  reloadKey,
  highlightId,
  onOpen,  emptyText,
  variant = "list",
}: RecordingsListProps) {
  const block = variant === "block";
  const { palette } = useTheme();
  const haptics = useHaptics();
  const [items, setItems] = useState<RecordingMeta[]>([]);
  // Listed at least once ("none" is said only then).
  const [loaded, setLoaded] = useState(false);
  // The recording whose menu (a long press) is open.
  const [menuFor, setMenuFor] = useState<RecordingMeta | null>(null);
  const {
    playingId,
    paused,
    position,
    downloadingId,
    play,
    togglePause,
    stop: stopPlayback,
  } = useRecordingPlayback({
    onDownloaded: (local) =>
      setItems((list) => list.map((x) => (x.id === local.id ? local : x))),
  });

  const load = useCallback(() => {
    listRecordings()
      .then((all) => {
        setItems(
          all.filter((r) => r.day === day && (!kind || r.kind === kind)),
        );
        setLoaded(true);
      })
      .catch((err) => logger.warn("Could not list recordings", err));
  }, [day, kind]);

  // Load on focus (the screen stays mounted; leaving it pauses playback, in
  // useRecordingPlayback).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    if (reloadKey != null) load();
  }, [reloadKey, load]);

  const confirmDelete = (r: RecordingMeta) => {
    Alert.alert(
      "Delete this recording?",
      r.backedUp
        ? "It is deleted from this phone and from your backup, and cannot be recovered."
        : "It cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            haptics.warning();
            if (playingId === r.id) stopPlayback();
            await deleteRecording(r.id);
            load();
            onChanged?.();
          },
        },
      ],
    );
  };

  // Listening back without touching the screen: don't let it lock.
  useKeepScreenOn(playingId != null && !paused);

  if (items.length === 0) {
    if (!loaded || emptyText === null) return null;
    return (
      <>
        {header ? <View style={styles.gutter}>{header}</View> : null}
        <Text
          style={[
            typeV2.body,
            styles.gutter,
            styles.none,
            { color: palette.secondary },
          ]}
          testID="recordings-none"
        >
          {emptyText ?? 'No recordings on this day'}
        </Text>
      </>
    );
  }
  return (
    <>
      {header ? <View style={styles.gutter}>{header}</View> : null}
      {items.map((r) => {
        const active = playingId === r.id;
        const playing = active && !paused;
        const downloading = downloadingId === r.id;
        const at = active ? position : 0;
        const currentPage = active ? pageAt(r.pageMarks, position) : null;
        const time = new Date(r.createdAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });
        const allLocal = r.segments.every((sg) => sg.local);
        const highlighted = r.id === highlightId;
        const name = KIND_LABEL[r.kind];
        return (
          <SwipeRow
            key={r.id}
            accessible={false}
            onHold={() => setMenuFor(r)}
            onDelete={() => confirmDelete(r)}
            deleteLabel="Delete recording"
            testID={`recording-${r.id}`}
          >
            <View style={block ? styles.blockRow : styles.row}>
              {block ? null : (
              <View
                style={styles.head}
                accessible
                accessibilityRole="header"
                accessibilityLabel={`${name} recording, ${time}${r.backedUp ? (allLocal ? ", backed up" : ", in your backup") : ""}`}
                accessibilityActions={[
                  { name: "delete", label: "Delete recording" },
                ]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === "delete") confirmDelete(r);
                }}
              >
                <Text
                  style={[typeV2.name, { color: palette.text }]}
                  maxFontSizeMultiplier={1.4}
                >
                  {name}
                </Text>
                <Text
                  style={[typeV2.meta, { color: palette.secondary }]}
                  maxFontSizeMultiplier={1.4}
                >
                  {time}
                </Text>
                {r.backedUp ? (
                  <Ionicons
                    name={
                      allLocal ? "cloud-done-outline" : "cloud-download-outline"
                    }
                    size={13}
                    color={palette.secondary}
                    testID={`recording-cloud-${r.id}`}
                  />
                ) : null}
              </View>
              )}
              <View style={block ? styles.blockLine : styles.line}>
                <View
                  accessible={block ? false : undefined}
                  accessibilityLabel={block ? `${name} recording, ${time}` : undefined}
                  style={[
                    styles.bubble,
                    block && styles.blockBubble,
                    { backgroundColor: palette.bubble },
                    highlighted && {
                      borderWidth: 1.5,
                      borderColor: palette.text,
                    },
                  ]}
                  testID={
                    highlighted
                      ? "highlighted-recording"
                      : `recording-bubble-${r.id}`
                  }
                >
                  <Tap
                    onPress={() => togglePause(r)}
                    style={[styles.play, { backgroundColor: palette.text }]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      downloading
                        ? "Downloading recording"
                        : playing
                          ? "Pause recording"
                          : "Play recording"
                    }
                    testID={`recording-play-${r.id}`}
                  >
                    {downloading ? (
                      <ActivityIndicator size="small" color={palette.bg} />
                    ) : (
                      <Ionicons
                        name={playing ? "pause" : "play"}
                        size={16}
                        color={palette.bg}
                        style={playing ? undefined : styles.playGlyph}
                        testID={`recording-play-icon-${r.id}`}
                      />
                    )}
                  </Tap>
                  <View style={styles.wave}>
                    <AudioWaveform
                      segments={r.segments}
                      active={active}
                      progress={playedFraction(at, r.durationMs)}
                      onSeek={(f) => play(r, Math.round(f * r.durationMs))}
                      height={24}
                      valueText={`${formatRecordingTime(at)} of ${formatRecordingTime(r.durationMs)}`}
                      testID={`recording-waveform-${r.id}`}
                    />
                  </View>
                  <Text
                    style={[
                      styles.time,
                      typeV2.numeral,
                      active
                        ? { color: palette.text, fontWeight: "600" }
                        : { color: palette.secondary },
                    ]}
                    maxFontSizeMultiplier={1.3}
                    testID={`recording-time-${r.id}`}
                  >
                    {formatRecordingTime(active ? position : r.durationMs)}
                  </Text>
                </View>
                {onOpen && !block ? (
                  <Tap
                    onPress={() => {
                      stopPlayback();
                      onOpen(r);
                    }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
                    style={styles.open}
                    accessibilityRole="button"
                    accessibilityLabel="Listen back with the pages"
                    testID={`recording-open-${r.id}`}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={palette.secondary}
                    />
                  </Tap>
                ) : null}
              </View>
              {!allLocal ? (
                <Text
                  style={[
                    typeV2.meta,
                    styles.note,
                    { color: palette.secondary },
                  ]}
                  maxFontSizeMultiplier={1.4}
                >
                  In your backup · downloads when played
                </Text>
              ) : null}
              {block ? (
                <View style={styles.blockFoot}>
                  <View style={[styles.chips, styles.blockChips]}>
                    {r.pageMarks.map((m) => {
                      const current = currentPage === m.page;
                      return (
                        <Tap
                          key={`${m.atMs}-${m.page}`}
                          onPress={() => play(r, m.atMs)}
                          style={[
                            styles.chip,
                            current
                              ? { backgroundColor: palette.text, borderColor: palette.text }
                              : { backgroundColor: palette.fill, borderColor: palette.separator },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Play from ${spokenText(placeOfPage(m.page, { form: 'long' }))}`}
                          accessibilityState={{ selected: current }}
                          testID={`recording-page-${r.id}-${m.page}`}
                        >
                          <Text
                            style={[styles.chipText, typeV2.numeral, { color: current ? palette.bg : palette.secondary }]}
                            maxFontSizeMultiplier={1.4}
                          >
                            {placeOfPage(m.page, { form: "short" })}
                          </Text>
                        </Tap>
                      );
                    })}
                  </View>
                  <Text
                    style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}
                    maxFontSizeMultiplier={1.4}
                    testID={`recording-when-${r.id}`}
                  >
                    {time}
                  </Text>
                </View>
              ) : r.pageMarks.length > 0 ? (
                <View style={styles.chips}>
                  {r.pageMarks.map((m) => {
                    const current = currentPage === m.page;
                    return (
                      <Tap
                        key={`${m.atMs}-${m.page}`}
                        onPress={() => play(r, m.atMs)}
                        style={[
                          styles.chip,
                          current
                            ? {
                                backgroundColor: palette.text,
                                borderColor: palette.text,
                              }
                            : {
                                backgroundColor: palette.fill,
                                borderColor: palette.separator,
                              },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Play from ${spokenText(placeOfPage(m.page, { form: 'long' }))}`}
                        accessibilityState={{ selected: current }}
                        testID={`recording-page-${r.id}-${m.page}`}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            typeV2.numeral,
                            { color: current ? palette.bg : palette.secondary },
                          ]}
                          maxFontSizeMultiplier={1.4}
                        >
                          {placeOfPage(m.page, { form: "short" })}
                        </Text>
                      </Tap>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </SwipeRow>
        );
      })}
      <ActionSheet
        visible={menuFor != null}
        onClose={() => setMenuFor(null)}
        title="Recording"
        message={
          menuFor
            ? `${KIND_LABEL[menuFor.kind]} · ${formatRecordingTime(menuFor.durationMs)}`
            : undefined
        }
        actions={
          menuFor
            ? [
                ...(block && onOpen
                  ? [
                      {
                        key: "listen",
                        label: "Listen back with the pages",
                        icon: "headset-outline" as const,
                        onPress: () => {
                          stopPlayback();
                          onOpen(menuFor);
                        },
                      },
                    ]
                  : []),
                {
                  key: "delete",
                  label: "Delete recording",
                  icon: "trash-outline",
                  destructive: true,
                  onPress: () => confirmDelete(menuFor),
                },
              ]
            : []
        }
        testID="recording-menu"
      />
    </>
  );
}

const PLAY = 36;

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: layoutV2.gutter },
  none: { paddingVertical: layoutV2.nestedPad },
  row: {
    paddingTop: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingBottom: 10,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  line: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  // The voice bubble: fully rounded, no outline (bubble is firmer than fill).
  bubble: {
    flex: 1,
    maxWidth: 360,
    minHeight: 48,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 6,
    paddingRight: 14,
  },
  play: {
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // The play triangle looks centred a point to the right.
  playGlyph: { marginLeft: 2 },
  wave: { flex: 1, minWidth: 0 },
  time: { fontSize: 13, lineHeight: 18, minWidth: 38, textAlign: "right" },
  open: {
    width: 18,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  note: { marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
  },
  chipText: { fontSize: 13, lineHeight: 17 },
  // The block variant (Activity's day, gap audit §4): no gutter, the bubble across the column,
  // the chips 8 below it with the time on their right.
  blockRow: {},
  blockLine: { flexDirection: "row", alignItems: "center" },
  blockBubble: { maxWidth: undefined },
  blockFoot: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 },
  blockChips: { flex: 1, marginTop: 0 },
});
