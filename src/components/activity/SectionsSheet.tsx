// Edit sections (ACT-29): Overview's or Insights' sections, each with a switch to show or hide it; hold one and drag
// it to move it (VoiceOver: Move up, Move down). Every change applies at once and is kept for the account on this
// phone (lib/activitySections); Done closes.

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import {
  REQUIRED_SECTIONS,
  SECTION_LABELS,
  isDefaultTab,
  moveSection,
  setSectionShown,
  updateActivitySections,
  DEFAULT_SECTIONS,
  type ActivityTab,
  type SectionId,
  type TabLayout,
} from '../../lib/activitySections';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Toggle } from '../v2/TopBar';
import { Tap } from '../v2/Tap';
import { ReorderableRows } from '../v2/ReorderableRows';
import type { ScrollLink } from '../plan/ReorderableDayList';
import { ChromeText } from './ChromeText';

/** Chrome: it stops growing at 1.4×, as the sheet's own header does. */
const MAX_SCALE = 1.4;

export const SHEET_TITLES: Record<ActivityTab, string> = {
  overview: 'Overview sections',
  insights: 'Insights sections',
};

export function SectionsSheet<T extends ActivityTab>({
  tab,
  visible,
  onClose,
  layout,
  has = () => true,
  notes = {},
}: {
  tab: T;
  visible: boolean;
  onClose: () => void;
  layout: TabLayout<T>;
  /** Sections the account can't have at all are left out of the list (Recitation without a take); they keep their slot. */
  has?: (id: SectionId<T>) => boolean;
  /** A quiet line under a section's name ("Smart Tracking is off"). */
  notes?: Partial<Record<SectionId<T>, string>>;
}) {
  const { palette } = useTheme();
  const rows = layout.order.filter((id) => has(id));
  const required = REQUIRED_SECTIONS[tab] as readonly string[];
  const labels = SECTION_LABELS[tab] as Record<string, string>;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(scrollRef);
  const contentHeight = useSharedValue(0);
  const scroll = useMemo<ScrollLink>(() => ({ ref: scrollRef, offset, contentHeight }), [scrollRef, offset, contentHeight]);
  const [dragging, setDragging] = useState(false);

  const change = (fn: (l: TabLayout<T>) => TabLayout<T>) => updateActivitySections(tab, fn);
  // The list shows only the sections the account has: a move between two of them moves it in the whole order.
  const move = (from: number, to: number) =>
    change((l) => moveSection(l, l.order.indexOf(rows[from]), l.order.indexOf(rows[to])));
  const show = (id: SectionId<T>, shown: boolean) => change((l) => setSectionShown(tab, l, id, shown));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={SHEET_TITLES[tab]}
      message="Hold a section and drag it to move it."
      messageMaxScale={MAX_SCALE}
      right={{ label: 'Done', strong: true, onPress: onClose, testID: 'sections-done' }}
      contentStyle={styles.content}
      testID={`sections-sheet-${tab}`}
    >
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        bounces={false}
        scrollEnabled={!dragging}
        onContentSizeChange={(_w, h) => {
          contentHeight.value = h;
        }}
      >
        <ReorderableRows
          rows={rows}
          keyOf={(id) => id}
          scroll={scroll}
          onMove={move}
          onDragChange={setDragging}
          onPress={(id) => {
            if (!required.includes(id)) show(id, layout.hidden.includes(id));
          }}
          testID="sections"
          accessibility={(id) => {
            const label = labels[id];
            const note = notes[id];
            if (required.includes(id)) return { label: `${label}, always shown` };
            const shown = !layout.hidden.includes(id);
            return {
              label: note ? `${label}, ${note}` : label,
              role: 'switch',
              state: { checked: shown },
              actions: [{ name: 'activate' }],
              onAction: (name) => {
                if (name === 'activate') show(id, !shown);
              },
            };
          }}
          renderRow={(id) => {
            const shown = !layout.hidden.includes(id);
            const note = notes[id];
            return (
              <View style={styles.row} testID={`sections-row-${id}`}>
                <Ionicons name="reorder-three-outline" size={22} color={palette.secondary} />
                <View style={styles.text}>
                  <ChromeText style={[typeV2.name, { color: shown ? palette.text : palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                    {labels[id]}
                  </ChromeText>
                  {note ? (
                    <ChromeText style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                      {note}
                    </ChromeText>
                  ) : null}
                </View>
                {required.includes(id) ? (
                  <ChromeText style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                    Always shown
                  </ChromeText>
                ) : (
                  // Only its picture: a tap anywhere on the row flips it (one target, and VoiceOver's row is the switch).
                  <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <Toggle value={shown} onValueChange={(v) => show(id, v)} testID={`sections-toggle-${id}`} />
                  </View>
                )}
              </View>
            );
          }}
        />
        {!isDefaultTab(tab, layout) ? (
          <Tap
            onPress={() => change(() => DEFAULT_SECTIONS[tab] as TabLayout<T>)}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.reset}
            testID="sections-reset"
          >
            <ChromeText style={[typeV2.name, { color: palette.link }]} maxFontSizeMultiplier={MAX_SCALE}>
              Show all, in the usual order
            </ChromeText>
          </Tap>
        ) : null}
      </Animated.ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { flexShrink: 1 },
  scroll: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 10,
  },
  text: { flex: 1, minWidth: 0 },
  reset: { alignSelf: 'center', paddingVertical: 14 },
});
