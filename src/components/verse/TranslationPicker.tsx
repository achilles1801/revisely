import React, { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import type { TranslationInfo } from '../../lib/translation';
import { pickerSections } from '../../lib/translationPicker';

/** Names and lines grow with Dynamic Type only this far (chrome). */
const CHROME_TEXT_SCALE = 1.4;
/** Holds text in another direction (an Arabic-script language name) apart from the line around it. */
const isolate = (s: string) => `⁨${s}⁩`;

interface Props {
  translations: TranslationInfo[];
  chosenId: string;
  onChoose: (id: string) => void;
}

/**
 * The verse sheet's translation picker (testers, for now): a search, the translation in use, then
 * every language with its translations, each row the translator and the credit its licence asks for.
 * A panel inside the verse sheet, not a modal of its own (iOS can't stack one over a modal sheet).
 */
export function TranslationPicker({ translations, chosenId, onChoose }: Props) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => pickerSections(translations, query, chosenId), [translations, query, chosenId]);

  return (
    <View style={styles.flex} testID="translation-picker">
      <View style={[styles.search, { backgroundColor: palette.bubble }]}>
        <Ionicons name="search" size={17} color={palette.secondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Language or translator"
          placeholderTextColor={palette.secondary}
          style={[styles.searchInput, { color: palette.text }]}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search translations by language or translator"
          testID="translation-search"
        />
        {query ? (
          <Tap
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
            testID="translation-search-clear"
          >
            <Ionicons name="close-circle" size={17} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={24}
        testID="translation-list"
        ListEmptyComponent={
          <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
            No translation matches “{query.trim()}”
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={[typeV2.meta, styles.header, { color: palette.secondary }]}
            maxFontSizeMultiplier={CHROME_TEXT_SCALE}
            accessibilityRole="header"
            testID={`translation-section-${section.key}`}
          >
            {section.native ? `${section.title} · ${isolate(section.native)}` : section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const chosen = item.id === chosenId;
          return (
            <Tap
              onPress={() => onChoose(item.id)}
              style={[styles.row, { borderBottomColor: palette.separator }]}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${item.name}, ${item.language}`}
              accessibilityHint={item.credit.text}
              testID={`translation-row-${item.id}`}
            >
              <View style={styles.text}>
                <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                  {item.name}
                </Text>
                {/* The credit its licence asks for, and where it comes from. */}
                <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                  {item.credit.text}
                </Text>
                <Text style={[typeV2.meta, { color: palette.link }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                  {item.credit.linkLabel}
                </Text>
              </View>
              {chosen ? <Ionicons name="checkmark" size={22} color={palette.text} /> : <View style={styles.check} />}
            </Tap>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: {
    height: 40,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  header: { paddingTop: 14, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: layoutV2.hairline,
  },
  text: { flex: 1, minWidth: 0, gap: 1 },
  check: { width: 22 },
  empty: { paddingVertical: 24, textAlign: 'center' },
});
