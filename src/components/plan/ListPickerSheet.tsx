import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlanSheet } from './PlanSheet';
import { PillTabs } from '../v2/PillTabs';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { spacing } from '../../theme/spacing';
import { arabicV2, layoutV2, radiusV2, typeV2 } from '../../theme/v2';

/**
 * Searchable picker sheet: header (Cancel / Title / Done), a search field,
 * pill tabs to switch lists, and a list whose rows carry a trailing checkmark
 * when selected.
 *
 * Fully controlled: the parent owns which rows are checked and reacts to
 * `onSelect(key)`. Works for single-select (parent dismisses on select) or
 * multi-select (parent toggles and commits on Done).
 *
 * A v2 sheet, the search on the quiet fill, pill tabs, and the rows flat on
 * the sheet on hairlines, the chosen ones checked in ink.
 */
export interface PickerItem {
  key: string;
  title: string;
  subtitle?: string;
  /** Small leading index, e.g. surah or juz number. */
  index?: string;
  /** Muted trailing text, e.g. the Arabic name. */
  trailing?: string;
  /** Extra lowercase text to match against search. */
  search?: string;
  checked?: boolean;
}

export interface PickerTab {
  key: string;
  label: string;
  items: PickerItem[];
  emptyText?: string;
}

export interface ListPickerSheetProps {
  title: string;
  tabs: PickerTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  onSelect: (key: string) => void;
  leftLabel?: string;
  onLeft?: () => void;
  rightLabel?: string;
  onRight?: () => void;
  rightDisabled?: boolean;
  searchPlaceholder?: string;
  stackBehavior?: 'push' | 'switch' | 'replace';
  onDismiss?: () => void;
  /** Optional footer note under the list. */
  footer?: string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-'ʼ’`]/g, '')
    .trim();
}

export const ListPickerSheet = forwardRef<BottomSheetModal, ListPickerSheetProps>(
  function ListPickerSheet(
    {
      title,
      tabs,
      activeTab,
      onTabChange,
      onSelect,
      leftLabel = 'Cancel',
      onLeft,
      rightLabel,
      onRight,
      rightDisabled,
      searchPlaceholder = 'Search',
      stackBehavior,
      onDismiss,
      footer,
    },
    ref,
  ) {
    const { palette } = useTheme();
    const haptics = useHaptics();
    const insets = useSafeAreaInsets();
    const [query, setQuery] = useState('');

    const tab = tabs.find((t) => t.key === activeTab) ?? tabs[0];

    const filtered = useMemo(() => {
      if (!tab) return [];
      const q = normalize(query);
      if (!q) return tab.items;
      return tab.items.filter((item) =>
        normalize(
          `${item.title} ${item.subtitle ?? ''} ${item.index ?? ''} ${item.trailing ?? ''} ${item.search ?? ''}`,
        ).includes(q),
      );
    }, [tab, query]);

    const handleDismiss = useCallback(() => {
      setQuery('');
      onDismiss?.();
    }, [onDismiss]);

    const renderItem = useCallback(
      ({ item }: { item: PickerItem }) => (
        <Tap
          onPress={() => {
            haptics.selection();
            onSelect(item.key);
          }}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          accessibilityHint={item.subtitle}
          accessibilityState={{ selected: !!item.checked }}
          style={v2.row}
          testID={`picker-item-${item.key}`}
        >
          {item.index ? (
            <Text style={[typeV2.meta, typeV2.numeral, v2.index, { color: palette.secondary }]} numberOfLines={1}>
              {item.index}
            </Text>
          ) : null}
          <View style={v2.rowText}>
            <Text
              style={[typeV2.body, item.checked && v2.checked, { color: palette.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
          {item.trailing ? (
            <Text style={[arabicV2(18), v2.trailing, { color: palette.secondary }]} numberOfLines={1}>
              {item.trailing}
            </Text>
          ) : null}
          <View style={v2.checkSlot}>
            {item.checked ? <Ionicons name="checkmark" size={20} color={palette.text} /> : null}
          </View>
        </Tap>
      ),
      [onSelect, haptics, palette],
    );

    const hasIndex = filtered.some((i) => !!i.index);
    const Separator = useCallback(
      () => (
        <View
          style={{
            marginLeft: hasIndex ? V2_INDEX_INSET : layoutV2.gutter,
            height: layoutV2.hairline,
            backgroundColor: palette.separator,
          }}
        />
      ),
      [hasIndex, palette.separator],
    );

    return (
      <PlanSheet
        ref={ref}
        title={title}
        leftLabel={leftLabel}
        onLeft={onLeft}
        rightLabel={rightLabel}
        onRight={onRight}
        rightDisabled={rightDisabled}
        snapPoints={['92%']}
        stackBehavior={stackBehavior}
        onDismiss={handleDismiss}
      >
        <View style={v2.controls}>
          <View style={[v2.search, { backgroundColor: palette.fill }]} testID="picker-search-field">
            <Ionicons name="search" size={18} color={palette.secondary} />
            <BottomSheetTextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={palette.secondary}
              style={[typeV2.body, v2.searchInput, { color: palette.text }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="never"
              accessibilityLabel={searchPlaceholder}
              testID="picker-search"
            />
            {query.length > 0 ? (
              <Tap onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={palette.secondary} />
              </Tap>
            ) : null}
          </View>
          {tabs.length > 1 ? (
            <PillTabs
              options={tabs.map((t) => ({ value: t.key, label: t.label }))}
              value={tab?.key ?? ''}
              onChange={onTabChange}
              testID="picker-tabs"
            />
          ) : null}
        </View>
        <BottomSheetFlatList<PickerItem>
          data={filtered}
          keyExtractor={(item: PickerItem) => item.key}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={20}
          contentContainerStyle={[v2.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
          ListEmptyComponent={
            <Text style={[typeV2.body, v2.empty, { color: palette.secondary }]}>
              {query ? `No results for “${query}”` : tab?.emptyText ?? 'Nothing here yet.'}
            </Text>
          }
          ListFooterComponent={
            footer && filtered.length > 0 ? (
              <Text style={[typeV2.meta, v2.footer, { color: palette.secondary }]}>
                {footer}
              </Text>
            ) : null
          }
        />
      </PlanSheet>
    );
  },
);

/** A row's text after its 26pt index: the gutter, the index, 12pt. */
const V2_INDEX_INSET = layoutV2.gutter + 26 + 12;

const v2 = StyleSheet.create({
  controls: { paddingHorizontal: layoutV2.gutter, gap: 12, paddingBottom: 12 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 40,
    borderRadius: radiusV2.media,
  },
  searchInput: { flex: 1, paddingVertical: 8 },
  listContent: { paddingTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 8,
    gap: 12,
  },
  index: { width: 26, textAlign: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  checked: { fontWeight: '600' },
  trailing: { maxWidth: 110 },
  checkSlot: { width: 22, alignItems: 'flex-end' },
  empty: { textAlign: 'center', paddingVertical: spacing.xl, paddingHorizontal: layoutV2.gutter },
  footer: { paddingHorizontal: layoutV2.gutter, paddingTop: 8 },
});
