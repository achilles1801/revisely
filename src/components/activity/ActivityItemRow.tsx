import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ActivityItem, ActivityKind } from '../../lib/activityItems';
import { dayAgo } from '../../lib/dayAgo';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Mark } from '../v2/Mark';
import { RowText, ThreadRow } from '../v2/ThreadRow';
import { Tap } from '../v2/Tap';

const KIND_ICON: Record<ActivityKind, keyof typeof Ionicons.glyphMap> = {
  revision: 'repeat-outline',
  reading: 'stopwatch-outline',
  recording: 'mic-outline',
  log: 'create-outline',
};

/**
 * One thing done, in two lines: what happened and when, then the specifics.
 * A revision session with every page revised wears the jade check.
 */
export function ActivityItemRow({
  item,
  today,
  onPress,
  onMenu,
  separator = true,
}: {
  item: ActivityItem;
  /** Today's revision day, for "2d". */
  today: string;
  onPress?: () => void;
  onMenu?: () => void;
  separator?: boolean;
}) {
  const when = dayAgo(item.day, today);
  return (
    <ThreadRow
      mark={item.done ? <Mark done /> : <Mark icon={KIND_ICON[item.kind]} />}
      name={item.title}
      meta={when}
      onPress={onPress}
      onMenu={onMenu}
      menuLabel="Session options"
      separator={separator}
      accessibilityLabel={`${item.title}, ${when}. ${item.detail}`}
      testID={`item-${item.key}`}
    >
      {item.detail ? (
        <RowText secondary numberOfLines={1}>
          {item.detail}
        </RowText>
      ) : null}
    </ThreadRow>
  );
}

/**
 * "Recent" on Activity and Home: a header with "See all", the latest few
 * items, or one quiet line when there are none.
 */
export function RecentSection({
  title = 'Recent',
  count,
  emptyText,
  onSeeAll,
  children,
  testID,
}: {
  title?: string;
  /** Items shown; 0 shows `emptyText` instead. */
  count: number;
  emptyText: string;
  onSeeAll: () => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View testID={testID}>
      <View style={styles.header}>
        <Text style={[typeV2.name, { color: palette.text }]} accessibilityRole="header">
          {title}
        </Text>
        {count > 0 ? (
          <Tap onPress={onSeeAll} hitSlop={10} accessibilityRole="button" accessibilityLabel={`See all ${title.toLowerCase()}`} testID="see-all">
            <Text style={[typeV2.body, { color: palette.link }]}>See all</Text>
          </Tap>
        ) : null}
      </View>
      {count > 0 ? (
        children
      ) : (
        <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="recent-empty">
          {emptyText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layoutV2.gutter,
    paddingTop: layoutV2.rowPad + 8,
    paddingBottom: 4,
  },
  empty: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: layoutV2.rowPad },
});
