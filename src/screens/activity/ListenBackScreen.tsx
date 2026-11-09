import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { ReaderFrame } from '../../components/reader/ReaderFrame';
import { RoundButton } from '../../components/reader/RoundButton';
import { CAPSULE_HEIGHT } from '../../components/reader/PlayerCapsule';
import { AudioWaveform } from '../../components/v2/AudioWaveform';
import { Tap } from '../../components/v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useKeepScreenOn } from '../../hooks/useKeepScreenOn';
import { useRecordingPlayback } from '../../hooks/useRecordingPlayback';
import { recordingPages, stretchStart } from '../../lib/listenBack';
import { listRecordings, pageAt, type RecordingMeta } from '../../lib/recordings';
import { formatRecordingTime } from '../../lib/recordingFormat';
import { playedFraction } from '../../lib/waveform';
import { speedLabel } from '../../lib/playbackPlan';
import { SpeedMenu, type Anchor } from '../../components/reader/SpeedMenu';
import { logger } from '../../lib/logger';
import { getReadPalette } from '../../theme/readPalette';
import { spacing } from '../../theme/spacing';
import { typeV2 } from '../../theme/v2';

const FOOTER_HEIGHT = CAPSULE_HEIGHT + spacing.sm;

const KIND_LABEL = { revision: 'Revision', reading: 'Reading' } as const;

/**
 * Listen back: a recording played over the pages it was recorded on. The page
 * turns as the recording reaches the next one (its page marks); swiping to a
 * page plays from where that page was recited (lib/listenBack's stretchStart;
 * paused, Play starts there).
 * Opened from a recording's "›" in Activity and from a recorded session's
 * end card, from the start (a `fromMs` opens it part way). Its own screen, not the reader, so
 * listening never moves the reading place or counts as reading.
 */
export default function ListenBackScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'ListenBack'>>();
  const navigation = useNavigation();
  const { recordingId, fromMs = 0 } = route.params;
  const { isDark, palette: v2 } = useTheme();
  const palette = getReadPalette(isDark);
  const focused = useIsFocused();

  const [rec, setRec] = useState<RecordingMeta | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    listRecordings()
      .then((all) => {
        if (!live) return;
        const found = all.find((r) => r.id === recordingId);
        if (found && found.pageMarks.length > 0) setRec(found);
        else setMissing(true);
      })
      .catch((err) => {
        logger.warn('Could not list recordings', err);
        if (live) setMissing(true);
      });
    return () => {
      live = false;
    };
  }, [recordingId]);

  const playback = useRecordingPlayback({ onDownloaded: setRec });
  const { play, cue, togglePause } = playback;
  const active = rec != null && playback.playingId === rec.id;
  const playing = active && !playback.paused;
  useKeepScreenOn(playing);

  const marks = rec?.pageMarks;
  const marksKey = marks?.map((m) => `${m.atMs}:${m.page}`).join(',') ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pages = useMemo(() => (marks ? recordingPages(marks) : []), [marksKey]);
  const initialPage = marks ? (pageAt(marks, fromMs) ?? pages[0]) : undefined;

  const pagerRef = useRef<MushafPagerHandle>(null);
  const [shownPage, setShownPage] = useState<number | null>(null);
  const shownPageRef = useRef<number | null>(null);
  if (shownPageRef.current == null && initialPage != null) shownPageRef.current = initialPage;
  const page = shownPage ?? initialPage ?? null;

  // Plays as soon as it opens, from where it was opened.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!rec || startedRef.current) return;
    startedRef.current = true;
    void play(rec, fromMs);
  }, [rec, fromMs, play]);

  // The page follows the recording while it plays.
  const followPage = active && marks ? pageAt(marks, playback.position) : null;
  useEffect(() => {
    if (!playing || followPage == null || followPage === shownPageRef.current) return;
    pagerRef.current?.scrollToPage(followPage);
  }, [playing, followPage]);

  // A swipe to a page plays from where it was recited.
  const swipedRef = useRef(false);
  const positionRef = useRef(playback.position);
  positionRef.current = playback.position;
  const recRef = useRef(rec);
  recRef.current = rec;
  const onUserSwipe = useCallback(() => {
    swipedRef.current = true;
  }, []);
  const onPageChange = useCallback(
    (p: number) => {
      const from = shownPageRef.current;
      shownPageRef.current = p;
      setShownPage(p);
      const swiped = swipedRef.current;
      swipedRef.current = false;
      const r = recRef.current;
      if (!swiped || !r) return;
      const at = stretchStart(r.pageMarks, p, positionRef.current, from);
      if (at != null) void cue(r, at);
    },
    [cue],
  );

  const when = rec
    ? new Date(rec.createdAt).toLocaleString([], {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
  const at = playback.position;
  const downloading = rec != null && playback.downloadingId === rec.id;
  // A thin line where each page after the first came on screen.
  const ticks = useMemo(
    () => (rec && rec.durationMs > 0 ? rec.pageMarks.filter((m) => m.atMs > 0).map((m) => m.atMs / rec.durationMs) : []),
    [rec],
  );
  const speedChip = useRef<View>(null);
  const [speedAnchor, setSpeedAnchor] = useState<Anchor | null>(null);
  const openSpeed = () =>
    speedChip.current?.measureInWindow((x, y, width, height) => setSpeedAnchor({ x, y, width, height }));

  const header = (
    <View style={styles.header}>
      <RoundButton icon="chevron-back" label="Back" onPress={() => navigation.goBack()} palette={palette} />
      <View style={styles.titleCol}>
        <Text
          style={[typeV2.name, styles.center, { color: palette.textPrimary }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          accessibilityRole="header"
        >
          Listen back
        </Text>
        {rec ? (
          <Text
            style={[typeV2.meta, styles.center, { color: palette.textSecondary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            testID="listen-back-page"
          >
            {KIND_LABEL[rec.kind]} · {when}
            {page != null ? ` · p. ${page}` : ''}
          </Text>
        ) : null}
      </View>
      {/* Balances the back button, so the title stays centred. */}
      <View style={styles.side} />
    </View>
  );

  // One bubble, as in Activity: play, the whole recording's bars with a tick at
  // each page turn, the time, the speed.
  const footer = rec ? (
    <View style={styles.footer}>
      <View style={[styles.capsule, { backgroundColor: v2.bubble }]} testID="listen-back-bar">
        <Tap
          onPress={() => void togglePause(rec)}
          style={[styles.play, { backgroundColor: v2.text }]}
          accessibilityRole="button"
          accessibilityLabel={downloading ? 'Downloading recording' : playing ? 'Pause recording' : 'Play recording'}
          testID="listen-back-play"
        >
          {downloading ? (
            <ActivityIndicator size="small" color={v2.bg} />
          ) : (
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={18}
              color={v2.bg}
              style={playing ? undefined : styles.playGlyph}
            />
          )}
        </Tap>
        <View style={styles.wave}>
          <AudioWaveform
            segments={rec.segments}
            progress={playedFraction(at, rec.durationMs)}
            onSeek={(f) => void play(rec, Math.round(f * rec.durationMs))}
            height={26}
            ticks={ticks}
            valueText={`${formatRecordingTime(at)} of ${formatRecordingTime(rec.durationMs)}`}
            testID="listen-back-waveform"
          />
        </View>
        <Text
          style={[styles.time, typeV2.numeral, { color: v2.text }]}
          maxFontSizeMultiplier={1.2}
          testID="listen-back-time"
        >
          {formatRecordingTime(at)}
          <Text style={{ color: v2.secondary, fontWeight: '400' }}> / {formatRecordingTime(rec.durationMs)}</Text>
        </Text>
        <View ref={speedChip} collapsable={false}>
          <Tap
            onPress={openSpeed}
            hitSlop={6}
            style={[styles.speed, { backgroundColor: v2.bg, borderColor: v2.outline }]}
            accessibilityRole="button"
            accessibilityLabel={`Speed ${speedLabel(playback.speed)}. Change speed`}
            testID="listen-back-speed"
          >
            <Text style={[styles.speedText, { color: v2.text }]} maxFontSizeMultiplier={1.2}>
              {speedLabel(playback.speed)}
            </Text>
          </Tap>
        </View>
      </View>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: palette.pageBg }]} testID="listen-back">
      <ReaderFrame
        chromeVisible
        active={focused}
        background={palette.pageBg}
        isDark={isDark}
        header={header}
        quietHeader={null}
        footer={footer}
        footerHeight={FOOTER_HEIGHT}
        pageLabel={null}
      >
        {rec && pages.length > 0 ? (
          <MushafPager
            ref={pagerRef}
            pages={pages}
            initialPage={initialPage}
            onPageChange={onPageChange}
            onUserSwipe={onUserSwipe}
          />
        ) : missing ? (
          <View style={styles.missing}>
            <Text
              style={[typeV2.body, styles.center, { color: palette.textSecondary }]}
              maxFontSizeMultiplier={1.4}
              testID="listen-back-missing"
            >
              This recording isn’t on this phone any more.
            </Text>
          </View>
        ) : null}
      </ReaderFrame>
      <SpeedMenu
        anchor={speedAnchor}
        value={playback.speed}
        onChange={playback.setSpeed}
        onClose={() => setSpeedAnchor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, gap: spacing.sm },
  titleCol: { flex: 1, alignItems: 'center' },
  side: { width: 36 },
  center: { textAlign: 'center' },
  footer: { flex: 1, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, justifyContent: 'flex-end' },
  capsule: {
    height: CAPSULE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    borderRadius: CAPSULE_HEIGHT / 2,
  },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // The play triangle looks centred a point to the right.
  playGlyph: { marginLeft: 2 },
  wave: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  time: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginRight: 6 },
  speed: {
    height: 28,
    minWidth: 38,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedText: { fontSize: 12, fontWeight: '600' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
});
