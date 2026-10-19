import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { claimAudio, onAudioClaimed, setAudioMode } from '../../lib/audioFocus';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  deleteRecording,
  isRecordingActive,
  listRecordings,
  locateInSegments,
  segmentStart,
  pageAt,
  RecordingKind,
  RecordingMeta,
} from '../../lib/recordings';
import { formatRecordingTime } from '../../lib/recordingFormat';
import { logger } from '../../lib/logger';

interface RecordingsListProps {
  day: string;
  kind?: RecordingKind;
  onChanged?: () => void;
  /** Shown above the list, only when there are recordings. */
  header?: React.ReactNode;
  /** Bump to reload (e.g. after the screen deleted a session's recordings). */
  reloadKey?: number;
}

const KIND_LABEL: Record<RecordingKind, string> = {
  revision: 'Revision',
  reading: 'Reading',
};

/**
 * A day's recordings: play / pause, a progress bar, the pages it covers (tap
 * one to play from there) and delete. Renders nothing when there are none.
 */
export function RecordingsList({ day, kind, onChanged, header, reloadKey }: RecordingsListProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [items, setItems] = useState<RecordingMeta[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);

  const load = useCallback(() => {
    listRecordings()
      .then((all) => setItems(all.filter((r) => r.day === day && (!kind || r.kind === kind))))
      .catch((err) => logger.warn('Could not list recordings', err));
  }, [day, kind]);

  // Load on focus; leaving the screen (another tab, the screen pushed under)
  // pauses playback, since the screen stays mounted.
  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        if (playerRef.current) {
          playerRef.current.pause();
          setPaused(true);
        }
      };
    }, [load]),
  );
  useEffect(() => {
    if (reloadKey != null) load();
  }, [reloadKey, load]);

  // The recording and segment loaded in the player. A recording is its
  // segments played back to back on one timeline.
  const currentRef = useRef<{ rec: RecordingMeta; index: number } | null>(null);

  const stopPlayback = useCallback(() => {
    playerRef.current?.pause();
    currentRef.current = null;
    setPlayingId(null);
    setPaused(false);
    setPosition(0);
  }, []);

  // Recitation or recording starting elsewhere stops this playback.
  const [listId] = useState(() => `recordings-${Math.random().toString(36).slice(2)}`);
  useEffect(
    () =>
      onAudioClaimed((_activity, owner) => {
        if (owner !== listId) stopPlayback();
      }),
    [listId, stopPlayback],
  );

  // Unmounting stops playback and frees the player.
  useEffect(
    () => () => {
      playerRef.current?.remove();
      playerRef.current = null;
    },
    [],
  );

  const loadSegment = (player: AudioPlayer, rec: RecordingMeta, index: number, offsetMs: number) => {
    currentRef.current = { rec, index };
    player.replace({ uri: rec.segments[index].uri });
    if (offsetMs > 0) player.seekTo(offsetMs / 1000).catch(() => undefined);
    player.play();
  };

  const play = (r: RecordingMeta, fromMs = 0) => {
    if (isRecordingActive()) {
      Alert.alert('Recording in progress', 'Pause the recording to play this one.');
      return;
    }
    claimAudio('recording-playback', listId);
    setAudioMode(false);
    let player = playerRef.current;
    if (!player) {
      const p = createAudioPlayer(null, { updateInterval: 250 });
      p.addListener('playbackStatusUpdate', (st) => {
        const cur = currentRef.current;
        if (!cur) return;
        setPosition(segmentStart(cur.rec.segments, cur.index) + st.currentTime * 1000);
        if (st.didJustFinish) {
          if (cur.index + 1 < cur.rec.segments.length) {
            loadSegment(p, cur.rec, cur.index + 1, 0);
          } else {
            currentRef.current = null;
            setPlayingId(null);
            setPaused(false);
            setPosition(0);
          }
        }
      });
      playerRef.current = p;
      player = p;
    }
    const { index, offsetMs } = locateInSegments(r.segments, fromMs);
    const cur = currentRef.current;
    if (!cur || cur.rec.id !== r.id || cur.index !== index) {
      loadSegment(player, r, index, offsetMs);
    } else {
      player.seekTo(offsetMs / 1000).catch(() => undefined);
      player.play();
    }
    setPosition(fromMs);
    setPlayingId(r.id);
    setPaused(false);
  };

  const togglePause = (r: RecordingMeta) => {
    if (playingId !== r.id) return play(r);
    if (paused) {
      playerRef.current?.play();
      setPaused(false);
    } else {
      playerRef.current?.pause();
      setPaused(true);
    }
  };

  const confirmDelete = (r: RecordingMeta) => {
    Alert.alert(
      'Delete this recording?',
      'It is stored only on this phone and cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (playingId === r.id) stopPlayback();
            await deleteRecording(r.id);
            load();
            onChanged?.();
          },
        },
      ],
    );
  };

  if (items.length === 0) return null;

  return (
    <>
      {header}
      <View style={styles.card}>
        <GlassCard style={StyleSheet.absoluteFillObject} />
        {items.map((r, i) => {
          const active = playingId === r.id;
          const progress = active && r.durationMs > 0 ? Math.min(1, position / r.durationMs) : 0;
          const currentPage = active ? pageAt(r.pageMarks, position) : null;
          const time = new Date(r.createdAt).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <View
              key={r.id}
              style={[
                styles.row,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={styles.rowTop}>
                <Pressable
                  onPress={() => togglePause(r)}
                  style={[styles.playBtn, { backgroundColor: theme.accent }]}
                  accessibilityLabel={active && !paused ? 'Pause recording' : 'Play recording'}
                >
                  <Ionicons name={active && !paused ? 'pause' : 'play'} size={16} color="#fff" />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>
                    {KIND_LABEL[r.kind]} · {time}
                  </Text>
                  <Text style={[typography.caption, { color: theme.textMuted }]}>
                    {active ? `${formatRecordingTime(position)} / ` : ''}
                    {formatRecordingTime(r.durationMs)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmDelete(r)}
                  hitSlop={10}
                  accessibilityLabel="Delete recording"
                >
                  <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
                </Pressable>
              </View>
              <View style={[styles.track, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${progress * 100}%`,
                      backgroundColor: theme.accent,
                    },
                  ]}
                />
              </View>
              {r.pageMarks.length > 0 && (
                <View style={styles.marks}>
                  {r.pageMarks.map((m) => (
                    <Pressable
                      key={`${m.atMs}-${m.page}`}
                      onPress={() => play(r, m.atMs)}
                      style={[
                        styles.mark,
                        {
                          borderColor: theme.border,
                          backgroundColor: theme.glass,
                        },
                        currentPage === m.page && {
                          backgroundColor: theme.accent + '22',
                          borderColor: theme.accent,
                        },
                      ]}
                      accessibilityLabel={`Play from page ${m.page}`}
                    >
                      <Text style={[typography.caption, { color: theme.textSecondary }]}>
                        p. {m.page}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: { borderRadius: radius.md, overflow: 'hidden' },
    row: { padding: spacing.md, gap: spacing.sm },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    playBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    track: { height: 3, borderRadius: 2, overflow: 'hidden' },
    fill: { height: 3 },
    marks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    mark: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
  });
