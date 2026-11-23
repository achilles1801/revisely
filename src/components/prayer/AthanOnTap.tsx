import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { claimAudio, onAudioClaimed, setAudioMode } from '../../lib/audioFocus';
import { athanEnabled, getAthanCatalog, refreshAthanCatalog, type AthanVoice } from '../../lib/athan';
import { tappedAthanVoiceId } from '../../lib/athan/tapped';
import { logger } from '../../lib/logger';
import { layoutV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { PillButton } from '../v2/PillButton';
import { Sheet } from '../v2/Sheet';

const OWNER = 'athan-full';
/** Notifications already answered in this run of the app (a remount doesn't play one again). */
const answered = new Set<string>();

/** Tests: forget which notifications were answered. */
export function resetAthanOnTapForTests(): void {
  answered.clear();
}

/**
 * ATHAN-4: a tap on a prayer's athan notification plays that voice's whole athan, from its start,
 * under a sheet with Stop. An iPhone notification plays only an athan's first 30 seconds; this is how
 * the rest is heard. It stops at its end, on Stop or the sheet closing, when other audio starts, and
 * when the app goes to the background. Nothing plays for a tap long after the prayer, for a voice the
 * catalog no longer offers, or where the athan isn't offered. Renders nothing until then.
 */
export function AthanOnTap() {
  const [voice, setVoice] = useState<AthanVoice | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const stop = useCallback(() => {
    playerRef.current?.pause();
    setVoice(null);
  }, []);

  const answer = useCallback(async (response: Notifications.NotificationResponse | null) => {
    try {
      const n = response?.notification;
      if (!n || !athanEnabled()) return;
      const id = tappedAthanVoiceId(n.request?.content?.data, n.date, Date.now());
      if (!id) return;
      const key = `${n.request.identifier}|${n.date}`;
      if (answered.has(key)) return;
      answered.add(key);
      // The saved catalog (and a fresh one if it is old): the voice may have been withdrawn.
      await refreshAthanCatalog().catch(() => undefined);
      const found = getAthanCatalog().find((v) => v.id === id);
      if (!found?.full) return;
      claimAudio('preview', OWNER);
      await setAudioMode(false);
      let player = playerRef.current;
      if (!player) {
        // keepAudioSessionActive: see lib/audioFocus.
        const p = createAudioPlayer(null, { updateInterval: 500, keepAudioSessionActive: true });
        p.addListener('playbackStatusUpdate', (st) => {
          if (st.didJustFinish) setVoice(null);
        });
        playerRef.current = p;
        player = p;
      }
      player.replace({ uri: found.full.url });
      player.play();
      setVoice(found);
    } catch (err) {
      logger.warn('Could not play the athan for a tapped notification', err);
    }
  }, []);

  useEffect(() => {
    if (!athanEnabled()) return;
    // The tap that opened the app, then any tap while it runs.
    Notifications.getLastNotificationResponseAsync()
      .then(answer)
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      answer(r).catch(() => undefined);
    });
    return () => sub.remove();
  }, [answer]);

  useEffect(() => onAudioClaimed((_activity, by) => by !== OWNER && stop()), [stop]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'background' && stop());
    return () => sub.remove();
  }, [stop]);
  useEffect(
    () => () => {
      playerRef.current?.remove();
      playerRef.current = null;
    },
    [],
  );

  return (
    <Sheet visible={!!voice} onClose={stop} title={voice?.name} message={t('prayer.athan.fullMessage')} testID="athan-full-sheet">
      <View style={styles.body}>
        <PillButton title={t('prayer.athan.fullStop')} size="lg" icon="stop" onPress={stop} testID="athan-full-stop" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layoutV2.gutter, paddingTop: 16, paddingBottom: 8 },
});
