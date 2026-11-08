import React, { useMemo, useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import type { TranslationInfo } from '../../lib/translation';
import { downloadLine, megabytes, pickerSections } from '../../lib/translationPicker';
import {
  DownloadStatus,
  downloadStatus,
  removeTranslation,
  startDownload,
  stopDownload,
  useDownloadsTick,
} from '../../lib/translationDownloads';

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
 * The verse sheet's translation picker (testers, for now): a search, the translation in use, the ones
 * on the phone, then every language with its translations, each row the translator and the credit
 * its licence asks for, what is on the phone, and a button to download it whole (with its size), stop
 * the download, or remove it. A panel inside the verse sheet, not a modal of its own (iOS can't
 * stack one over a modal sheet).
 */
export function TranslationPicker({ translations, chosenId, onChoose }: Props) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  // Re-renders as downloads move on, and as suras are kept while being read.
  const tick = useDownloadsTick(translations);
  const sections = useMemo(
    () => pickerSections(translations, query, chosenId, (t) => downloadStatus(t)?.phase === 'complete'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translations, query, chosenId, tick],
  );

  const confirmRemove = (t: TranslationInfo, s: DownloadStatus) =>
    Alert.alert(`Remove ${t.name}?`, `This frees ${megabytes(s.bytesOnPhone)}. You can download it again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeTranslation(t) },
    ]);

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
          const status = downloadStatus(item);
          const line = downloadLine(status);
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
                {line ? (
                  <Text
                    style={[typeV2.meta, { color: status?.phase === 'failed' ? palette.red : palette.secondary }]}
                    maxFontSizeMultiplier={CHROME_TEXT_SCALE}
                    testID={`translation-status-${item.id}`}
                  >
                    {line}
                  </Text>
                ) : null}
              </View>
              {status?.manageable ? <DownloadButton t={item} s={status} onRemove={confirmRemove} /> : null}
              {chosen ? <Ionicons name="checkmark" size={22} color={palette.text} /> : <View style={styles.check} />}
            </Tap>
          );
        }}
      />
    </View>
  );
}

/** Download (with its size), stop a download, or remove it from the phone. */
function DownloadButton({
  t,
  s,
  onRemove,
}: {
  t: TranslationInfo;
  s: DownloadStatus;
  onRemove: (t: TranslationInfo, s: DownloadStatus) => void;
}) {
  const { palette } = useTheme();
  if (s.phase === 'downloading') {
    return (
      <Tap
        onPress={() => stopDownload(t)}
        hitSlop={8}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={`Stop downloading ${t.name}`}
        testID={`translation-stop-${t.id}`}
      >
        <Ionicons name="stop-circle-outline" size={24} color={palette.text} />
      </Tap>
    );
  }
  if (s.phase === 'complete') {
    return (
      <Tap
        onPress={() => onRemove(t, s)}
        hitSlop={8}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${t.name} from this phone, ${megabytes(s.bytesOnPhone)}`}
        testID={`translation-remove-${t.id}`}
      >
        <Ionicons name="trash-outline" size={22} color={palette.red} />
      </Tap>
    );
  }
  return (
    <Tap
      onPress={() => void startDownload(t)}
      hitSlop={8}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={`Download ${t.name}, ${megabytes(s.bytes)}`}
      testID={`translation-download-${t.id}`}
    >
      <Ionicons name="cloud-download-outline" size={24} color={palette.text} />
    </Tap>
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
  action: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 24, textAlign: 'center' },
});
