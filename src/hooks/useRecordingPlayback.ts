import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { claimAudio, onAudioClaimed, setAudioMode } from '../lib/audioFocus';
import { isRecordingActive, locateInSegments, segmentStart, type RecordingMeta } from '../lib/recordings';
import { downloadMissingSegments } from '../lib/recordingBackup';
import { logger } from '../lib/logger';

// After a seek, the player can still report the old time once or twice; those
// reports are ignored (for this long, or until one lands near the target), so
// the time and a page following it don't jump back and forth.
const SEEK_SETTLE_MS = 2000;
const SEEK_NEAR_MS = 1500;

/**
 * Plays recordings: its segments back to back on one timeline, a seek waiting
 * until the file has loaded (iOS ignores it before), a recording restored from
 * the backup downloaded first. Leaving the screen or the app pauses it;
 * recitation or a recording starting elsewhere stops it. Used by the day's
 * recordings list and by Listen back.
 */
export function useRecordingPlayback({ onDownloaded }: { onDownloaded?: (r: RecordingMeta) => void } = {}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const setPaused = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPausedState(v);
  }, []);
  const [position, setPosition] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  // Playback speed (Listen back's chip), kept while the screen is open.
  const [speed, setSpeedState] = useState(1);
  const speedRef = useRef(1);
  const onDownloadedRef = useRef(onDownloaded);
  onDownloadedRef.current = onDownloaded;

  // The recording and segment loaded in the player.
  const currentRef = useRef<{ rec: RecordingMeta; index: number } | null>(null);
  // Whether the loaded segment has been heard playing yet.
  const seenPlayingRef = useRef(false);
  // A seek asked for before the segment has loaded (iOS ignores those).
  const pendingSeekRef = useRef<number | null>(null);
  // Where the last seek went on the timeline (see SEEK_SETTLE_MS).
  const seekRef = useRef<{ ms: number; until: number } | null>(null);
  // Moved while not playing (cue): the recording, and where Play starts.
  const cueRef = useRef<{ id: string; ms: number } | null>(null);

  // Leaving the screen (another tab, a screen pushed over it) pauses playback.
  useFocusEffect(
    useCallback(
      () => () => {
        if (playerRef.current && currentRef.current) {
          playerRef.current.pause();
          setPaused(true);
        }
      },
      [setPaused],
    ),
  );

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
  }, [setPaused]);

  const stop = useCallback(() => {
    playerRef.current?.pause();
    currentRef.current = null;
    pendingSeekRef.current = null;
    seekRef.current = null;
    cueRef.current = null;
    setPlayingId(null);
    setPaused(false);
    setPosition(0);
  }, [setPaused]);

  // Recitation or recording starting elsewhere stops this playback.
  const [owner] = useState(() => `recordings-${Math.random().toString(36).slice(2)}`);
  useEffect(
    () =>
      onAudioClaimed((_activity, by) => {
        if (by !== owner) stop();
      }),
    [owner, stop],
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

  // Faster or slower without changing the voice's pitch.
  const applySpeed = (player: AudioPlayer) => {
    try {
      player.shouldCorrectPitch = true;
      player.setPlaybackRate(speedRef.current, 'high');
    } catch (err) {
      logger.warn('Recording speed not applied', err);
    }
  };

  const loadSegment = (player: AudioPlayer, rec: RecordingMeta, index: number, offsetMs: number) => {
    currentRef.current = { rec, index };
    seenPlayingRef.current = false;
    player.replace({ uri: rec.segments[index].uri });
    // A new file may start at normal speed.
    if (speedRef.current !== 1) applySpeed(player);
    // Seek once the file has loaded (see the status listener).
    pendingSeekRef.current = offsetMs > 0 ? offsetMs : null;
    player.play();
  };

  const ensurePlayer = (): AudioPlayer => {
    if (playerRef.current) return playerRef.current;
    // keepAudioSessionActive: see lib/audioFocus (otherwise iOS audio is
    // switched off under a segment that is still loading).
    const p = createAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: true });
    p.addListener('playbackStatusUpdate', (st) => {
      const cur = currentRef.current;
      if (!cur) return;
      // An event still describing the previous file (queued before the
      // replace) is ignored: its duration doesn't match this segment's.
      const expectedMs = cur.rec.segments[cur.index].durationMs;
      const isThisItem = st.isLoaded && st.duration > 0 && Math.abs(st.duration * 1000 - expectedMs) < 750;
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
      if (seenPlayingRef.current && !st.playing && !st.isBuffering && !st.didJustFinish && !pausedRef.current) {
        pausedRef.current = true;
        setPaused(true);
      }
      const at = segmentStart(cur.rec.segments, cur.index) + st.currentTime * 1000;
      const seek = seekRef.current;
      if (cueRef.current && pausedRef.current) {
        // Paused and moved: the time shows where Play will start.
      } else if (seek && Date.now() < seek.until && Math.abs(at - seek.ms) > SEEK_NEAR_MS && !st.didJustFinish) {
        // A report from before the seek took effect.
      } else {
        seekRef.current = null;
        setPosition(at);
      }
      if (st.didJustFinish) {
        if (cur.index + 1 < cur.rec.segments.length) {
          loadSegment(p, cur.rec, cur.index + 1, 0);
        } else {
          currentRef.current = null;
          seekRef.current = null;
          setPlayingId(null);
          setPaused(false);
          setPosition(0);
        }
      }
    });
    playerRef.current = p;
    return p;
  };

  const playLocal = (r: RecordingMeta, fromMs = 0) => {
    if (isRecordingActive()) {
      Alert.alert('Recording in progress', 'Pause the recording to play this one.');
      return;
    }
    claimAudio('recording-playback', owner);
    setAudioMode(false);
    const player = ensurePlayer();
    cueRef.current = null;
    seekRef.current = fromMs > 0 ? { ms: fromMs, until: Date.now() + SEEK_SETTLE_MS } : null;
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

  // A recording restored from the backup (another phone, a reinstall) is
  // downloaded the first time it's played (lib/recordingBackup).
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const downloadingRef = useRef(false);
  const play = async (r: RecordingMeta, fromMs = 0) => {
    if (r.segments.every((sg) => sg.local)) return playLocal(r, fromMs);
    const uid = getAuth().currentUser?.uid;
    if (!uid || downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloadingId(r.id);
    try {
      const local = await downloadMissingSegments(uid, r);
      onDownloadedRef.current?.(local);
      playLocal(local, fromMs);
    } catch (err) {
      logger.warn('Could not download recording', err);
      Alert.alert('Couldn’t download this recording', 'Check your connection and try again.');
    } finally {
      downloadingRef.current = false;
      setDownloadingId(null);
    }
  };

  /** Play, pause, or carry on (from where it was moved to while paused). */
  const togglePause = (r: RecordingMeta) => {
    const cued = cueRef.current?.id === r.id ? cueRef.current.ms : null;
    if (playingId !== r.id) return play(r, cued ?? 0);
    if (paused) {
      if (cued != null) return play(r, cued);
      seenPlayingRef.current = false;
      playerRef.current?.play();
      setPaused(false);
    } else {
      playerRef.current?.pause();
      setPaused(true);
    }
  };

  /** Move to `ms` without playing: while playing, play from there; otherwise
   *  the time shows it and Play starts there. */
  const cue = (r: RecordingMeta, ms: number) => {
    if (playingId === r.id && !paused) return play(r, ms);
    cueRef.current = { id: r.id, ms };
    setPosition(ms);
  };

  const setSpeed = (next: number) => {
    speedRef.current = next;
    setSpeedState(next);
    if (playerRef.current) applySpeed(playerRef.current);
  };

  return { playingId, paused, position, downloadingId, speed, setSpeed, play, togglePause, cue, stop };
}
