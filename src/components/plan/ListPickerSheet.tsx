import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlanSheet } from './PlanSheet';
import { LiquidGlassSegmentedControl } from '../LiquidGlassSegmentedControl';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { fonts } from '../../theme/typography';

/**
 * iOS-style searchable picker sheet: header (Cancel / Title / Done), a search
 * field, a segmented control to switch lists, and a grouped inset list whose
 * rows carry a trailing checkmark when selected.
 *
 * Fully controlled: the parent owns which rows are checked and reacts to
 * `onSelect(key)`. Works for single-select (parent dismisses on select) or
 * multi-select (parent toggles and commits on Done).
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
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => makeStyles(theme), [theme]);
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
      ({ item, index }: { item: PickerItem; index: number }) => {
        const first = index === 0;
        const last = index === filtered.length - 1;
        return (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(item.key);
            }}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityHint={item.subtitle}
            accessibilityState={{ selected: !!item.checked }}
            style={({ pressed }) => [
              styles.row,
              first && styles.rowFirst,
              last && styles.rowLast,
              pressed && styles.rowPressed,
            ]}
          >
            {item.index ? (
              <Text style={styles.index} numberOfLines={1}>
                {item.index}
              </Text>
            ) : null}
            <View style={styles.rowText}>
              <Text
                style={[styles.title, item.checked && styles.titleChecked]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            {item.trailing ? (
              <Text style={styles.trailing} numberOfLines={1}>
                {item.trailing}
              </Text>
            ) : null}
            <View style={styles.checkSlot}>
              {item.checked ? (
                <Ionicons name="checkmark" size={20} color={theme.accent} />
              ) : null}
            </View>
          </Pressable>
        );
      },
      [filtered.length, onSelect, styles, theme.accent],
    );

    const hasIndex = filtered.some((i) => !!i.index);
    const Separator = useCallback(
      () => (
        <View style={styles.sepWrap}>
          <View
            style={[styles.sep, { marginLeft: hasIndex ? spacing.md + 26 + spacing.sm : spacing.md }]}
          />
        </View>
      ),
      [styles, hasIndex],
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
        <View style={styles.controls}>
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={theme.textMuted} />
            <BottomSheetTextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={theme.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="never"
              accessibilityLabel={searchPlaceholder}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={17} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {tabs.length > 1 ? (
            <LiquidGlassSegmentedControl
              options={tabs.map((t) => ({ value: t.key, label: t.label }))}
              value={tab?.key ?? ''}
              onChange={onTabChange}
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
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query ? `No results for “${query}”` : tab?.emptyText ?? 'Nothing here yet.'}
            </Text>
          }
          ListFooterComponent={
            footer && filtered.length > 0 ? <Text style={styles.footer}>{footer}</Text> : null
          }
        />
      </PlanSheet>
    );
  },
);

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    controls: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      paddingBottom: spacing.sm,
    },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 38,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 17,
      color: theme.textPrimary,
      paddingVertical: 0,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      gap: spacing.sm,
      backgroundColor: theme.glass,
    },
    rowFirst: {
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
    },
    rowLast: {
      borderBottomLeftRadius: radius.md,
      borderBottomRightRadius: radius.md,
    },
    rowPressed: {
      backgroundColor: theme.accent + '22',
    },
    index: {
      width: 26,
      fontSize: 15,
      color: theme.textMuted,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 17,
      lineHeight: 22,
      color: theme.textPrimary,
      letterSpacing: -0.2,
    },
    titleChecked: {
      fontWeight: '500',
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.textSecondary,
      marginTop: 1,
    },
    trailing: {
      fontFamily: fonts.arabic,
      fontSize: 18,
      color: theme.textMuted,
      maxWidth: 110,
    },
    checkSlot: {
      width: 22,
      alignItems: 'flex-end',
    },
    sepWrap: {
      backgroundColor: theme.glass,
    },
    sep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },
    empty: {
      fontSize: 15,
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },
    footer: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.textMuted,
      paddingHorizontal: spacing.md,
      marginTop: 6,
    },
  });
