import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { ActionSheet } from '../v2/ActionSheet';
import { Tap } from '../v2/Tap';
import type { QuranWords } from '../../lib/recite/quranWords';
import { passageOf } from '../reciteLive/TakeSummarySheet';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { takeLine, TakeSheetRow, type TakeMenuAction } from './TakeRows';

/**
 * A day's takes (RMEM-5, RMEM-6; Majd's option A, Nov 16 2026): what the day's one Recited row opens. Each take is a
 * row ▶, passage, line, score; a tap shows it on the page, a hold opens its menu. All recitations is All activity's
 * Recitations. Takes are never recordings, so this is the one place a day lists them.
 */
export function RecitedSheet({
  visible,
  dayLabel,
  takes,
  words,
  clearedOf,
  playable,
  onShow,
  onPlay,
  actionsFor,
  onSeeAll,
  onClose,
}: {
  visible: boolean;
  /** "Today", or the day's own name. */
  dayLabel: string;
  takes: TakeRecord[];
  words: QuranWords | null;
  /** How many words each take cleared from the page. */
  clearedOf: (take: TakeRecord) => number;
  /** The takes whose audio is on this phone (their ▶). */
  playable: ReadonlySet<string>;
  onShow: (take: TakeRecord) => void;
  onPlay: (recordingId: string) => void;
  /** A take's menu (RINS-3, RMEM-6): Show on the page, Ask Revo about this take, Delete this take. */
  actionsFor: (take: TakeRecord) => TakeMenuAction[];
  onSeeAll?: () => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  // Held: its menu, presented by this sheet (one modal at a time on iOS).
  const [held, setHeld] = React.useState<TakeRecord | null>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title="Recited" message={dayLabel} scroll testID="recited-sheet">
      {/* Newest first, as the progress page and All activity list takes. */}
      {[...takes].reverse().map((t, i) => (
        <TakeSheetRow
          key={t.id}
          take={t}
          words={words}
          cleared={clearedOf(t)}
          playable={t.recordingId != null && playable.has(t.recordingId)}
          onShow={onShow}
          onPlay={onPlay}
          onHold={() => setHeld(t)}
          actions={actionsFor(t)}
          first={i === 0}
        />
      ))}
      <ActionSheet
        visible={held != null}
        onClose={() => setHeld(null)}
        title={held && words ? passageOf(words, held.from, held.to) : 'Recited'}
        message={held ? takeLine(held, clearedOf(held)) : undefined}
        actions={(held ? actionsFor(held) : []).map((a) => ({
          ...a,
          icon: a.key === 'ask-revo' ? 'sparkles-outline' : a.key === 'delete' ? 'trash-outline' : 'book-outline',
          destructive: a.key === 'delete',
        }))}
        testID="recited-take-menu"
      />
      {onSeeAll ? (
        <View style={[styles.foot, { borderTopColor: palette.separator }]}>
          <Tap onPress={onSeeAll} hitSlop={8} accessibilityRole="button" testID="recited-see-all">
            <Text style={[typeV2.body, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
              All recitations
            </Text>
          </Tap>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  foot: { borderTopWidth: layoutV2.hairline, paddingHorizontal: layoutV2.gutter, paddingTop: 14, paddingBottom: 8 },
});
