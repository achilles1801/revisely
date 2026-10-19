import React, { useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ReadPalette } from '../theme/readPalette';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import {
  MUSHAF_PAGE_COUNT,
  pageAtPosition,
  positionOfPage,
  scrubberPreview,
} from '../lib/mushafScrubber';
import { getJuzForPage } from '../lib/quranData';

// Room either side of the track so the thumb can sit on page 1 / 604 and
// still be under a finger.
const TRACK_INSET = 12;
const HIT_HEIGHT = 32;
const THUMB = 12;
const THUMB_ACTIVE = 18;

interface MushafScrubberProps {
  /** The page the reader is on. */
  page: number;
  /** Called once, on release, with the page to go to. */
  onJump: (page: number) => void;
  palette: ReadPalette;
  totalPages?: number;
}

/**
 * Slim position track for the mushaf, read right to left like the pages:
 * page 1 at the right end. Dragging previews the page (number, surah, juz)
 * and only jumps when the finger lifts, so the pager does not load every page
 * passed over. A tap jumps straight to the tapped spot.
 */
export function MushafScrubber({
  page,
  onJump,
  palette,
  totalPages = MUSHAF_PAGE_COUNT,
}: MushafScrubberProps) {
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [width, setWidth] = useState(0);
  const [dragPage, setDragPage] = useState<number | null>(null);

  // The responder is created once, so it reads everything through refs.
  const widthRef = useRef(0);
  const startXRef = useRef(0);
  const dragPageRef = useRef<number | null>(null);
  const juzRef = useRef(0);
  const onJumpRef = useRef(onJump);
  onJumpRef.current = onJump;
  const totalRef = useRef(totalPages);
  totalRef.current = totalPages;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the gesture once started; the pager underneath must not take it.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startXRef.current = e.nativeEvent.locationX - TRACK_INSET;
        juzRef.current = 0;
        update(startXRef.current);
      },
      onPanResponderMove: (_, g) => update(startXRef.current + g.dx),
      onPanResponderRelease: () => {
        const target = dragPageRef.current;
        dragPageRef.current = null;
        setDragPage(null);
        if (target != null) onJumpRef.current(target);
      },
      onPanResponderTerminate: () => {
        dragPageRef.current = null;
        setDragPage(null);
      },
    }),
  ).current;

  function update(x: number) {
    const next = pageAtPosition(x, widthRef.current, totalRef.current);
    if (next === dragPageRef.current) return;
    dragPageRef.current = next;
    setDragPage(next);
    // A tick at each juz boundary gives the drag some texture.
    const juz = getJuzForPage(next);
    if (juzRef.current !== 0 && juz !== juzRef.current) Haptics.selectionAsync();
    juzRef.current = juz;
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(0, e.nativeEvent.layout.width - TRACK_INSET * 2);
    widthRef.current = w;
    setWidth(w);
  };

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment' && page < totalPages) onJump(page + 1);
    if (e.nativeEvent.actionName === 'decrement' && page > 1) onJump(page - 1);
  };

  const shown = dragPage ?? page;
  const thumbX = positionOfPage(shown, width, totalPages);
  const thumbSize = dragPage != null ? THUMB_ACTIVE : THUMB;
  const preview = dragPage != null ? scrubberPreview(dragPage) : null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {preview && (
        <View style={styles.bubble} pointerEvents="none">
          <Text style={styles.bubblePage}>Page {preview.page}</Text>
          <Text style={styles.bubbleMeta} numberOfLines={1}>
            {preview.surahs} · Juz {preview.juz}
          </Text>
        </View>
      )}
      <View
        style={styles.hitArea}
        onLayout={onLayout}
        {...responder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Page position"
        accessibilityHint="Drag to jump to another page"
        accessibilityValue={{ min: 1, max: totalPages, now: page, text: `Page ${page}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        testID="mushaf-scrubber"
      >
        <View style={styles.trackBox} pointerEvents="none">
          <View style={styles.track} />
          {/* Read so far, measured from page 1 at the right. */}
          <View style={[styles.fill, { left: thumbX }]} />
          <View
            style={[
              styles.thumb,
              {
                width: thumbSize,
                height: thumbSize,
                borderRadius: thumbSize / 2,
                left: thumbX - thumbSize / 2,
                top: (HIT_HEIGHT - thumbSize) / 2,
                backgroundColor:
                  dragPage != null ? palette.textPrimary : palette.textSecondary,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (palette: ReadPalette) =>
  StyleSheet.create({
    wrap: { alignSelf: 'stretch', alignItems: 'center' },
    hitArea: {
      alignSelf: 'stretch',
      height: HIT_HEIGHT,
      paddingHorizontal: TRACK_INSET,
    },
    trackBox: { flex: 1 },
    track: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: (HIT_HEIGHT - 3) / 2,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: palette.divider,
    },
    fill: {
      position: 'absolute',
      right: 0,
      top: (HIT_HEIGHT - 3) / 2,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: palette.textMuted,
      opacity: 0.6,
    },
    thumb: { position: 'absolute' },
    bubble: {
      position: 'absolute',
      bottom: HIT_HEIGHT + spacing.xs,
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: palette.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.divider,
      maxWidth: '90%',
    },
    bubblePage: {
      ...typography.titleSmall,
      color: palette.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    bubbleMeta: { ...typography.caption, color: palette.textSecondary, marginTop: 1 },
  });
