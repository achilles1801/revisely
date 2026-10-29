import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { claimAudio, onAudioClaimed, setAudioMode } from '../../lib/audioFocus';
import type { AthanVoice } from '../../lib/athan';

/**
 * Listening to an athan voice in the picker (streamed from its previewUrl).
 * One at a time; it takes the audio (recitation or a recording stops) and stops
 * when something else does, when it ends, when the app leaves, or with the
 * screen.
 */
export function useAthanPreview() {
  const [playing, setPlaying] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const [owner] = useState(() => `athan-preview-${Math.random().toString(36).slice(2)}`);

  const stop = useCallback(() => {
    playerRef.current?.pause();
    setPlaying(null);
  }, []);

  useEffect(() => onAudioClaimed((_activity, by) => by !== owner && stop()), [owner, stop]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && stop());
    return () => sub.remove();
  }, [stop]);
  useEffect(
    () => () => {
      playerRef.current?.remove();
      playerRef.current = null;
    },
    [],
  );

  const toggle = useCallback(
    (voice: AthanVoice) => {
      if (playing === voice.id) return stop();
      if (!voice.previewUrl) return;
      claimAudio('preview', owner);
      setAudioMode(false);
      let player = playerRef.current;
      if (!player) {
        // keepAudioSessionActive: see lib/audioFocus.
        const p = createAudioPlayer(null, { updateInterval: 500, keepAudioSessionActive: true });
        p.addListener('playbackStatusUpdate', (st) => {
          if (st.didJustFinish) setPlaying(null);
        });
        playerRef.current = p;
        player = p;
      }
      player.replace({ uri: voice.previewUrl });
      player.play();
      setPlaying(voice.id);
    },
    [owner, playing, stop],
  );

  return { playing, toggle, stop };
}
