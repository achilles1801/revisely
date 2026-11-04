import React, { useMemo, useState } from 'react';
import { Alert, Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getReadPalette } from '../../theme/readPalette';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import {
  MUSHAF_EDITION_ORDER,
  MUSHAF_EDITIONS,
  MushafEditionId,
  setMushafEdition,
  useMushafEdition,
} from '../../lib/mushafEdition';
import { otherEditionsOnPhone, removeOtherEditionPages } from '../../lib/mushafOffline';
import { pageSizeTable } from '../../lib/pageCache';
import { formatMegabytes, useMushafOffline } from '../../lib/mushafOfflineUi';

/** Names and lines grow with Dynamic Type only this far (chrome). */
const CHROME_TEXT_SCALE = 1.4;
/** The thumbnail's width; its height follows the page. */
const THUMB_WIDTH = 44;

// The top of page 582 (An-Naba') in each print, from the pages themselves
// (scripts/build-mushaf-1441.py --thumbs).
const THUMBS: Record<MushafEditionId, ImageSourcePropType> = {
  madani1405: require('../../../assets/mushaf/thumb-madani1405.png'),
  madani1441: require('../../../assets/mushaf/thumb-madani1441.png'),
};
/** The thumbnails' width / height. */
const THUMB_ASPECT = 3 / 4;

function editionBytes(id: MushafEditionId): number {
  return pageSizeTable(id).reduce((a, b) => a + b, 0);
}

/**
 * Settings → Mushaf: the prints of the Madani mushaf the pages can show. The
 * page numbers are the same in each, so choosing one changes nothing else.
 * The one chosen downloads in the background like the offline mushaf; the
 * other's pages stay until removed here.
 */
export function MushafPickerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, isDark } = useTheme();
  const read = getReadPalette(isDark);
  const current = useMushafEdition();
  const offline = useMushafOffline();
  // What else is on the phone: read when the sheet opens and after a change.
  const [tick, setTick] = useState(0);
  const others = useMemo(
    () => (visible ? otherEditionsOnPhone() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, current, tick, offline.pages],
  );

  const choose = (id: MushafEditionId) => {
    if (id === current) return;
    void setMushafEdition(id).then(() => setTick((t) => t + 1));
  };

  const status = (id: MushafEditionId): string => {
    if (id === current) {
      if (offline.phase === 'complete' || offline.pages >= offline.total) return 'On this phone';
      if (offline.pages > 0) return `${offline.pages} of ${offline.total} pages on this phone`;
      return `Downloads as you read, and in the background · ${formatMegabytes(editionBytes(id))}`;
    }
    const here = others.find((o) => o.edition === id);
    if (here) return here.pages >= offline.total ? 'On this phone' : `${here.pages} of ${offline.total} pages on this phone`;
    return `${formatMegabytes(editionBytes(id))} to download`;
  };

  const remove = (id: MushafEditionId, bytes: number) =>
    Alert.alert(`Remove ${MUSHAF_EDITIONS[id].name}?`, `This frees ${formatMegabytes(bytes)}. It downloads again if you choose it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeOtherEditionPages(id);
          setTick((t) => t + 1);
        },
      },
    ]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Mushaf"
      right={{ label: 'Done', onPress: onClose, strong: true, testID: 'mushaf-picker-done' }}
      scroll
      testID="mushaf-picker"
    >
      {MUSHAF_EDITION_ORDER.map((id) => {
        const e = MUSHAF_EDITIONS[id];
        const selected = id === current;
        return (
          <Tap
            key={id}
            onPress={() => choose(id)}
            style={[styles.row, { borderBottomColor: palette.separator }]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${e.name}, ${e.description}`}
            accessibilityHint={status(id)}
            testID={`mushaf-edition-${id}`}
          >
            <View style={[styles.thumb, { backgroundColor: read.pageBg, borderColor: palette.outline }]}>
              <Image
                source={THUMBS[id]}
                style={[styles.thumbImage, read.pageTint != null && { tintColor: read.pageTint }]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View style={styles.text}>
              <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                {e.name}
              </Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                {e.description}
              </Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                {status(id)}
              </Text>
            </View>
            {selected ? <Ionicons name="checkmark" size={22} color={palette.text} /> : <View style={styles.check} />}
          </Tap>
        );
      })}
      {others.map((o) => (
        <Tap
          key={`remove-${o.edition}`}
          onPress={() => remove(o.edition, o.bytes)}
          style={[styles.removeRow, { borderBottomColor: palette.separator }]}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${MUSHAF_EDITIONS[o.edition].name} from this phone, ${formatMegabytes(o.bytes)}`}
          testID={`mushaf-remove-${o.edition}`}
        >
          <Ionicons name="trash-outline" size={22} color={palette.red} />
          <Text style={[typeV2.body, styles.removeText, { color: palette.red }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
            Remove {MUSHAF_EDITIONS[o.edition].name} from this phone
          </Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
            {formatMegabytes(o.bytes)}
          </Text>
        </Tap>
      ))}
      <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]}>
        Page numbers are the same in both, so your plan and progress stay as they are. On 36 pages,
        mostly in Juz ʿAmma, a few verses sit on the page before or after.
      </Text>
      {MUSHAF_EDITION_ORDER.map((id) => (
        <Text key={`credit-${id}`} style={[typeV2.meta, styles.credit, { color: palette.secondary }]} testID={`mushaf-credit-${id}`}>
          {MUSHAF_EDITIONS[id].name}: {MUSHAF_EDITIONS[id].credit}
        </Text>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_WIDTH / THUMB_ASPECT,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  text: { flex: 1, gap: 2 },
  check: { width: 22 },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  removeText: { flex: 1 },
  note: { paddingHorizontal: layoutV2.gutter, paddingTop: 14 },
  credit: { paddingHorizontal: layoutV2.gutter, paddingTop: 8 },
});
