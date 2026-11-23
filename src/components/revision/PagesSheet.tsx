import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { t } from '../../i18n';

const ROW_HEIGHT = 52;

/**
 * A session's one menu (SESS-1): the day's pages by number, the page on screen highlighted in the accent. A tap on a
 * row goes to that page (which marks nothing), its circle marks or unmarks it, and the line on top marks them all.
 * Majd, Nov 23 2026: "same with the pages sheet let's not do ayah numbers it should just be page numbers and also the
 * you are here text should be highlighted or something to make it more clear, with the accent color".
 */
export function PagesSheet({
  visible,
  onClose,
  pages,
  done,
  current,
  onJump,
  onToggle,
  onMarkAll,
  onUnmarkAll,
  onRate,
  onHelp,
}: {
  visible: boolean;
  onClose: () => void;
  pages: readonly number[];
  done: ReadonlySet<number>;
  /** The page on screen. */
  current: number;
  onJump: (page: number) => void;
  onToggle: (page: number) => void;
  onMarkAll: () => void;
  onUnmarkAll: () => void;
  /** With Smart Tracking: rate the page on screen. */
  onRate?: () => void;
  onHelp?: () => void;
}) {
  const { palette } = useTheme();
  const revised = pages.filter((p) => done.has(p)).length;
  const allDone = pages.length > 0 && revised === pages.length;

  // Rate and Help open a sheet of their own, once this one has gone (iOS can't present over a modal going away).
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };
  const afterClosing = (fn: () => void) => {
    pending.current = fn;
    onClose();
  };

  // A long day opens with the page on screen in view.
  const list = useRef<ScrollView>(null);
  const placed = useRef(false);
  useEffect(() => {
    if (!visible) placed.current = false;
  }, [visible]);
  const placeHere = (y: number) => {
    if (placed.current) return;
    placed.current = true;
    list.current?.scrollTo({ y: Math.max(0, y - ROW_HEIGHT), animated: false });
  };

  const actionRow = (key: string, icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void) => (
    <Tap
      key={key}
      onPress={() => afterClosing(onPress)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.action}
      testID={`session-pages-${key}`}
    >
      <Ionicons name={icon} size={22} color={palette.text} />
      <Text style={[typeV2.menu, styles.actionText, { color: palette.text }]}>{label}</Text>
    </Tap>
  );

  const actions = [
    ...(onRate ? [actionRow('rate', 'fitness-outline', t('revision.session.ratePageStrength'), onRate)] : []),
    ...(onHelp ? [actionRow('help', 'help-circle-outline', t('revision.pages.help'), onHelp)] : []),
  ];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('revision.pages.title')}
      onHidden={runPending}
      contentStyle={styles.content}
      pinned={
        actions.length > 0 ? (
          <View style={[styles.actions, { borderTopColor: palette.separator }]}>{actions}</View>
        ) : null
      }
      testID="session-pages-sheet"
    >
      <View style={styles.summary}>
        <Text style={[typeV2.meta, styles.summaryText, { color: palette.secondary }]} testID="session-pages-count">
          {t('revision.end.progress', { done: revised, total: pages.length })}
        </Text>
        <Tap
          onPress={allDone ? onUnmarkAll : onMarkAll}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={allDone ? t('revision.pages.unmarkAll') : t('revision.pages.markAll')}
          testID="session-pages-mark-all"
        >
          <Text style={[typeV2.meta, styles.markAll, { color: palette.link }]}>
            {allDone ? t('revision.pages.unmarkAll') : t('revision.pages.markAll')}
          </Text>
        </Tap>
      </View>
      <ScrollView ref={list} style={styles.list} bounces={false}>
        {pages.map((page) => {
          const here = page === current;
          const checked = done.has(page);
          return (
            <View
              key={page}
              onLayout={here ? (e) => placeHere(e.nativeEvent.layout.y) : undefined}
              style={[
                styles.row,
                here
                  ? [styles.rowHere, { backgroundColor: palette.accentSubtle }]
                  : { borderBottomColor: palette.separator, borderBottomWidth: layoutV2.hairline },
              ]}
              testID={here ? 'session-pages-here' : `session-pages-row-${page}`}
            >
              <Tap
                onPress={() => onJump(page)}
                style={styles.rowMain}
                accessibilityRole="button"
                accessibilityLabel={t(here ? 'revision.pages.hereLabel' : 'revision.pages.goTo', { n: page })}
                testID={`session-pages-go-${page}`}
              >
                <Text style={[here ? typeV2.name : typeV2.body, { color: here ? palette.subtleText : palette.text }]}>
                  {t('common.pageN', { n: page })}
                </Text>
                {here ? (
                  <View style={[styles.herePill, { backgroundColor: palette.accentText }]}>
                    <Text style={[typeV2.meta, styles.hereText, { color: palette.onAccentText }]} numberOfLines={1}>
                      {t('revision.pages.here')}
                    </Text>
                  </View>
                ) : null}
              </Tap>
              <Tap
                onPress={() => onToggle(page)}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityLabel={t(checked ? 'revision.pages.unmark' : 'revision.pages.mark', { n: page })}
                accessibilityState={{ checked }}
                style={[
                  styles.circle,
                  checked ? { backgroundColor: palette.done } : { borderWidth: 1.5, borderColor: palette.outline },
                ]}
                testID={here ? 'session-pages-toggle-here' : `session-pages-toggle-${page}`}
              >
                {checked ? <Ionicons name="checkmark" size={16} color={palette.onDone} /> : null}
              </Tap>
            </View>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { flexShrink: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  summaryText: { flexShrink: 1 },
  markAll: { fontWeight: '600' },
  list: { flexShrink: 1 },
  row: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowHere: { marginHorizontal: -8, paddingHorizontal: 8, borderRadius: radiusV2.media },
  rowMain: { flex: 1, minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  herePill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  hereText: { fontWeight: '600' },
  circle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actions: { borderTopWidth: layoutV2.hairline, marginTop: 4, paddingTop: 2 },
  action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionText: { flex: 1 },
});
