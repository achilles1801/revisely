import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { claimAudio, onAudioClaimed, setAudioMode } from '../../lib/audioFocus';
import { useTheme } from '../../context/ThemeContext';
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
import { downloadMissingSegments } from '../../lib/recordingBackup';
import { useKeepScreenOn } from '../../hooks/useKeepScreenOn';
import { useHaptics } from '../../design/haptics';
import { playedFraction, waveformBars } from '../../lib/waveform';
import { layoutV2, markV2, radiusV2, typeV2 } from '../../theme/v2';
import { ThreadRow } from '../v2/ThreadRow';
import { Tap } from '../v2/Tap';
import { ActionSheet } from '../v2/ActionSheet';
import { AudioWaveform } from '../v2/AudioWaveform';

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
}

const KIND_LABEL: Record<RecordingKind, string> = {
  revision: 'Revision',
  reading: 'Reading',
};

/**
 * A day's recordings: play / pause, a progress bar, the pages it covers (tap
 * one to play from there) and delete.
 *
 * A row per recording on hairlines, the play button where a feed puts the
 * avatar, the waveform with its progress (tap or drag to seek), the time, the
 * pages as chips and a ⋯ menu (Delete). None: one quiet line.
 */
export function RecordingsList({
  day,
  kind,
  onChanged,
  header,
  reloadKey,
  highlightId,
}: RecordingsListProps) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const [items, setItems] = useState<RecordingMeta[]>([]);
  // Listed at least once ("none" is said only then).
  const [loaded, setLoaded] = useState(false);
  // The recording whose ⋯ menu is open.
  const [menuFor, setMenuFor] = useState<RecordingMeta | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const setPaused = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPausedState(v);
  }, []);
  const [position, setPosition] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);

  const load = useCallback(() => {
    listRecordings()
      .then((all) => {
        setItems(all.filter((r) => r.day === day && (!kind || r.kind === kind)));
        setLoaded(true);
      })
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

  // A recording's playback stays in the foreground: leaving the app pauses it
  // (recitation, unlike it, carries on; lib/audioFocus).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && playerRef.current?.playing) {
        playerRef.current.pause();
        setPaused(true);
      }
    });
    return () => sub.remove();
  }, []);

  // The recording and segment loaded in the player. A recording is its
  // segments played back to back on one timeline.
  const currentRef = useRef<{ rec: RecordingMeta; index: number } | null>(null);

  // Whether the loaded segment has been heard playing yet.
  const seenPlayingRef = useRef(false);
  // A seek asked for before the segment has loaded (iOS ignores those).
  const pendingSeekRef = useRef<number | null>(null);

  const stopPlayback = useCallback(() => {
    playerRef.current?.pause();
    currentRef.current = null;
    pendingSeekRef.current = null;
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
      currentRef.current = null;
      playerRef.current?.remove();
      playerRef.current = null;
    },
    [],
  );

  const loadSegment = (player: AudioPlayer, rec: RecordingMeta, index: number, offsetMs: number) => {
    currentRef.current = { rec, index };
    seenPlayingRef.current = false;
    player.replace({ uri: rec.segments[index].uri });
    // Seek once the file has loaded (see the status listener).
    pendingSeekRef.current = offsetMs > 0 ? offsetMs : null;
    player.play();
  };

  // A recording restored from the backup (another phone, a reinstall) is
  // downloaded the first time it's played (lib/recordingBackup).
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const play = async (r: RecordingMeta, fromMs = 0) => {
    if (r.segments.every((sg) => sg.local)) return playLocal(r, fromMs);
    const uid = getAuth().currentUser?.uid;
    if (!uid || downloadingId) return;
    setDownloadingId(r.id);
    try {
      const local = await downloadMissingSegments(uid, r);
      setItems((list) => list.map((x) => (x.id === r.id ? local : x)));
      playLocal(local, fromMs);
    } catch (err) {
      logger.warn('Could not download recording', err);
      Alert.alert('Couldn’t download this recording', 'Check your connection and try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const playLocal = (r: RecordingMeta, fromMs = 0) => {
    if (isRecordingActive()) {
      Alert.alert('Recording in progress', 'Pause the recording to play this one.');
      return;
    }
    claimAudio('recording-playback', listId);
    setAudioMode(false);
    let player = playerRef.current;
    if (!player) {
      // keepAudioSessionActive: see lib/audioFocus (otherwise iOS audio is
      // switched off under a segment that is still loading).
      const p = createAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: true });
      p.addListener('playbackStatusUpdate', (st) => {
        const cur = currentRef.current;
        if (!cur) return;
        // An event still describing the previous file (queued before the
        // replace) is ignored: its duration doesn't match this segment's.
        const expectedMs = cur.rec.segments[cur.index].durationMs;
        const isThisItem =
          st.isLoaded && st.duration > 0 && Math.abs(st.duration * 1000 - expectedMs) < 750;
        if (pendingSeekRef.current != null) {
          if (!isThisItem) return;
          const ms = pendingSeekRef.current;
          pendingSeekRef.current = null;
          p.seekTo(ms / 1000).catch(() => undefined);
          return;
        }
        if (st.isLoaded && !isThisItem && !st.didJustFinish) return;
        if (st.playing) seenPlayingRef.current = true;
        // Paused from outside (a call, headphones unplugged) once it had been
        // playing (not the moment between play() and the sound starting).
        if (
          seenPlayingRef.current &&
          !st.playing &&
          !st.isBuffering &&
          !st.didJustFinish &&
          !pausedRef.current
        ) {
          pausedRef.current = true;
          setPaused(true);
        }
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
    } else if (player.isLoaded) {
      player.seekTo(offsetMs / 1000).catch(() => undefined);
      player.play();
    } else {
      pendingSeekRef.current = offsetMs > 0 ? offsetMs : null;
      player.play();
    }
    setPosition(fromMs);
    setPlayingId(r.id);
    setPaused(false);
  };

  const togglePause = (r: RecordingMeta) => {
    if (playingId !== r.id) return play(r);
    if (paused) {
      seenPlayingRef.current = false;
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
      r.backedUp
        ? 'It is deleted from this phone and from your backup, and cannot be recovered.'
        : 'It cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
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

  // Each recording's waveform (levels kept on this phone; none: flat).
  const bars = useMemo(() => new Map(items.map((r) => [r.id, waveformBars(r.segments)])), [items]);

  if (items.length === 0) {
    if (!loaded) return null;
    return (
      <>
        {header ? <View style={v2.gutter}>{header}</View> : null}
        <Text style={[typeV2.body, v2.gutter, v2.none, { color: palette.secondary }]} testID="recordings-none">
          No recordings on this day
        </Text>
      </>
    );
  }
  return (
    <>
      {header ? <View style={v2.gutter}>{header}</View> : null}
      {items.map((r) => {
        const active = playingId === r.id;
        const playing = active && !paused;
        const downloading = downloadingId === r.id;
        const at = active ? position : 0;
        const currentPage = active ? pageAt(r.pageMarks, position) : null;
        const time = new Date(r.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const allLocal = r.segments.every((sg) => sg.local);
        const highlighted = r.id === highlightId;
        return (
          <View
            key={r.id}
            style={highlighted && { backgroundColor: palette.fill }}
            testID={highlighted ? 'highlighted-recording' : undefined}
          >
            <ThreadRow
              mark={
                <Tap
                  onPress={() => togglePause(r)}
                  style={[v2.play, { backgroundColor: palette.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    downloading ? 'Downloading recording' : playing ? 'Pause recording' : 'Play recording'
                  }
                  testID={`recording-play-${r.id}`}
                >
                  {downloading ? (
                    <ActivityIndicator size="small" color={palette.onPrimary} />
                  ) : (
                    <Ionicons
                      name={playing ? 'pause' : 'play'}
                      size={18}
                      color={palette.onPrimary}
                      style={playing ? undefined : v2.playGlyph}
                      testID={`recording-play-icon-${r.id}`}
                    />
                  )}
                </Tap>
              }
              name={KIND_LABEL[r.kind]}
              meta={time}
              onMenu={() => setMenuFor(r)}
              menuLabel="Recording options"
              testID={`recording-${r.id}`}
              footer={
                r.pageMarks.length > 0
                  ? r.pageMarks.map((m) => {
                      const current = currentPage === m.page;
                      return (
                        <Tap
                          key={`${m.atMs}-${m.page}`}
                          onPress={() => play(r, m.atMs)}
                          style={[v2.chip, { backgroundColor: current ? palette.primary : palette.fill }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Play from page ${m.page}`}
                          accessibilityState={{ selected: current }}
                          testID={`recording-page-${r.id}-${m.page}`}
                        >
                          <Text
                            style={[typeV2.meta, typeV2.numeral, { color: current ? palette.onPrimary : palette.secondary }]}
                            maxFontSizeMultiplier={1.4}
                          >
                            p. {m.page}
                          </Text>
                        </Tap>
                      );
                    })
                  : undefined
              }
            >
              <View style={v2.wave}>
                <AudioWaveform
                  bars={bars.get(r.id) ?? []}
                  progress={playedFraction(at, r.durationMs)}
                  onSeek={(f) => play(r, Math.round(f * r.durationMs))}
                  valueText={`${formatRecordingTime(at)} of ${formatRecordingTime(r.durationMs)}`}
                  testID={`recording-waveform-${r.id}`}
                />
              </View>
              <View style={v2.timeRow}>
                <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]} testID={`recording-time-${r.id}`}>
                  {active ? `${formatRecordingTime(position)} / ` : ''}
                  {formatRecordingTime(r.durationMs)}
                </Text>
                {r.backedUp && (
                  <Ionicons
                    name={allLocal ? 'cloud-done-outline' : 'cloud-download-outline'}
                    size={13}
                    color={palette.secondary}
                    accessibilityLabel={allLocal ? 'Backed up' : 'In your backup; downloads when played'}
                  />
                )}
              </View>
            </ThreadRow>
            {highlighted ? <View style={[v2.highlight, { backgroundColor: palette.accentText }]} /> : null}
          </View>
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
                {
                  key: 'delete',
                  label: 'Delete recording',
                  icon: 'trash-outline',
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

const v2 = StyleSheet.create({
  gutter: { paddingHorizontal: layoutV2.gutter },
  none: { paddingVertical: layoutV2.nestedPad },
  play: {
    width: markV2.top,
    height: markV2.top,
    borderRadius: markV2.top / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The play triangle looks centred a point to the right.
  playGlyph: { marginLeft: 2 },
  // The recording just saved ("Recording saved · View"): a mark at the edge.
  highlight: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  wave: { marginTop: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  chip: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: radiusV2.chip,
    justifyContent: 'center',
  },
});
