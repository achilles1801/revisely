import React, { useMemo, useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import type { TranslationInfo } from '../../lib/translation';
import { languageName } from '../../lib/translationLanguages';
import { downloadLine, megabytes, pickerSections } from '../../lib/translationPicker';
import {
  DownloadStatus,
  downloadStatus,
  removeTranslation,
  startDownload,
  stopDownload,
  useDownloadsTick,
} from '../../lib/translationDownloads';
import { moveFavorite, toggleFavorite, useFavorites } from '../../lib/translationFavorites';
import { t } from '../../i18n';

/** Names and lines grow with Dynamic Type only this far (chrome). */
const CHROME_TEXT_SCALE = 1.4;
/** Holds text in another direction (an Arabic-script language name) apart from the line around it. */
const isolate = (s: string) => `⁨${s}⁩`;
/** Groups whose rows say their language (the language groups say it in their header). */
const SAYS_LANGUAGE = new Set(['selected', 'favorites', 'downloaded']);

interface Props {
  translations: TranslationInfo[];
  chosenId: string;
  onChoose: (id: string) => void;
  /** The account: favorites are kept on the phone for each. */
  accountId?: string;
}

/**
 * The verse sheet's translation picker (every account since Nov 2026; TRANS-5, TRANS-6, TRANS-8). Translations
 * and Edit, a search over every group, then Selected (the one in use), Favorites in the order starred,
 * Downloaded, and every language with its translations. Each row: the translator, the credit its
 * licence asks for, its source and what is on the phone; a download button (its size; stop while it
 * comes) and a star. Edit reorders or unstars favorites and deletes downloads. A panel inside the
 * verse sheet, not a modal of its own (iOS can't stack one over a modal sheet).
 */
export function TranslationPicker({ translations, chosenId, onChoose, accountId }: Props) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const favorites = useFavorites(accountId);
  // Re-renders as downloads move on, and as suras are kept while being read.
  const tick = useDownloadsTick(translations);
  const sections = useMemo(
    () =>
      pickerSections(translations, query, {
        chosenId,
        downloaded: (t) => downloadStatus(t)?.phase === 'complete',
        removable: (t) => downloadStatus(t)?.manageable === true,
        favorites,
        editing,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translations, query, chosenId, favorites, editing, tick],
  );

  const confirmRemove = (option: TranslationInfo, s: DownloadStatus) =>
    Alert.alert(
      t('verse.picker.removeTitle', { name: option.name }),
      t('verse.picker.removeBody', { size: megabytes(s.bytesOnPhone) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.remove'), style: 'destructive', onPress: () => removeTranslation(option) },
      ],
    );

  return (
    <View style={styles.flex} testID="translation-picker">
      <View style={styles.titleRow}>
        <Text style={[typeV2.sheetTitle, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
          {t('verse.picker.title')}
        </Text>
        <Tap
          onPress={() => setEditing((e) => !e)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={editing ? t('verse.picker.doneEditing') : t('verse.picker.edit')}
          testID="translation-edit"
        >
          <Text style={[typeV2.button, { color: palette.link }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
            {editing ? t('common.done') : t('common.edit')}
          </Text>
        </Tap>
      </View>
      <View style={[styles.search, { backgroundColor: palette.bubble }]}>
        <Ionicons name="search" size={17} color={palette.secondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('verse.picker.search')}
          placeholderTextColor={palette.secondary}
          style={[styles.searchInput, { color: palette.text }]}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t('verse.picker.searchLabel')}
          testID="translation-search"
        />
        {query ? (
          <Tap
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('verse.picker.clearSearch')}
            testID="translation-search-clear"
          >
            <Ionicons name="close-circle" size={17} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={24}
        testID="translation-list"
        ListEmptyComponent={
          <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
            {editing ? t('verse.picker.noFavorites') : t('verse.picker.noMatch', { query: query.trim() })}
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
        renderItem={({ item, section }) => {
          const chosen = item.id === chosenId;
          const status = downloadStatus(item);
          const line = downloadLine(status);
          const lang = languageName(item.languageCode);
          const starred = favorites.includes(item.id);
          return (
            <Tap
              onPress={() => onChoose(item.id)}
              disabled={editing}
              style={[styles.row, { borderBottomColor: palette.separator }]}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen, disabled: editing }}
              accessibilityLabel={`${item.name}, ${item.language}`}
              accessibilityHint={item.credit.text}
              testID={`translation-row-${item.id}`}
            >
              {chosen && !editing ? (
                <Ionicons name="checkmark-circle" size={22} color={palette.primary} testID="translation-selected-mark" />
              ) : null}
              <View style={styles.text}>
                {SAYS_LANGUAGE.has(section.key) ? (
                  <Text style={[typeV2.meta, { color: palette.accentText }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                    {lang.native !== lang.name ? `${lang.name} · ${isolate(lang.native)}` : lang.name}
                  </Text>
                ) : null}
                <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                  {item.name}
                </Text>
                {/* The credit its licence asks for, and where it comes from. */}
                <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                  {item.credit.text}
                </Text>
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                  <Text style={{ color: palette.link }}>{item.credit.linkLabel}</Text>
                  {line ? ' · ' : ''}
                  {line ? (
                    <Text
                      style={status?.phase === 'failed' ? { color: palette.red } : undefined}
                      testID={`translation-status-${item.id}`}
                    >
                      {line}
                    </Text>
                  ) : null}
                </Text>
              </View>
              {editing ? (
                section.key === 'favorites' ? (
                  <FavoriteEdits
                    tr={item}
                    uid={accountId}
                    first={section.data[0] === item}
                    last={section.data[section.data.length - 1] === item}
                  />
                ) : status?.manageable ? (
                  <IconButton
                    icon="trash-outline"
                    color={palette.red}
                    label={t('verse.picker.removeFromPhone', { name: item.name, size: megabytes(status.bytesOnPhone) })}
                    onPress={() => confirmRemove(item, status)}
                    testID={`translation-remove-${item.id}`}
                  />
                ) : null
              ) : (
                <>
                  {status?.manageable ? <DownloadButton tr={item} s={status} onRemove={confirmRemove} /> : null}
                  {accountId ? (
                    <IconButton
                      icon={starred ? 'star' : 'star-outline'}
                      color={starred ? palette.accentText : palette.secondary}
                      size={20}
                      label={starred ? t('verse.picker.unfavorite', { name: item.name }) : t('verse.picker.favorite', { name: item.name })}
                      selected={starred}
                      onPress={() => void toggleFavorite(accountId, item.id)}
                      testID={`translation-star-${item.id}`}
                    />
                  ) : null}
                </>
              )}
            </Tap>
          );
        }}
      />
    </View>
  );
}

function IconButton({
  icon,
  color,
  label,
  onPress,
  testID,
  size = 22,
  selected,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
  onPress: () => void;
  testID: string;
  size?: number;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.action, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      testID={testID}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Tap>
  );
}

/** Edit, a favorite: up, down, and its star taken away. */
function FavoriteEdits({ tr, uid, first, last }: { tr: TranslationInfo; uid?: string; first: boolean; last: boolean }) {
  const { palette } = useTheme();
  if (!uid) return null;
  return (
    <>
      <IconButton
        icon="chevron-up"
        color={palette.text}
        label={t('verse.picker.moveUp', { name: tr.name })}
        disabled={first}
        onPress={() => void moveFavorite(uid, tr.id, -1)}
        testID={`translation-up-${tr.id}`}
      />
      <IconButton
        icon="chevron-down"
        color={palette.text}
        label={t('verse.picker.moveDown', { name: tr.name })}
        disabled={last}
        onPress={() => void moveFavorite(uid, tr.id, 1)}
        testID={`translation-down-${tr.id}`}
      />
      <IconButton
        icon="remove-circle-outline"
        color={palette.red}
        label={t('verse.picker.unfavorite', { name: tr.name })}
        onPress={() => void toggleFavorite(uid, tr.id)}
        testID={`translation-unstar-${tr.id}`}
      />
    </>
  );
}

/** Download (with its size), stop a download, or remove it from the phone. */
function DownloadButton({
  tr,
  s,
  onRemove,
}: {
  tr: TranslationInfo;
  s: DownloadStatus;
  onRemove: (tr: TranslationInfo, s: DownloadStatus) => void;
}) {
  const { palette } = useTheme();
  if (s.phase === 'downloading') {
    return (
      <IconButton
        icon="stop-circle-outline"
        color={palette.text}
        label={t('verse.picker.stopDownload', { name: tr.name })}
        onPress={() => stopDownload(tr)}
        testID={`translation-stop-${tr.id}`}
      />
    );
  }
  if (s.phase === 'complete') {
    return (
      <IconButton
        icon="trash-outline"
        color={palette.red}
        label={t('verse.picker.removeFromPhone', { name: tr.name, size: megabytes(s.bytesOnPhone) })}
        onPress={() => onRemove(tr, s)}
        testID={`translation-remove-${tr.id}`}
      />
    );
  }
  return (
    <IconButton
      icon="cloud-download-outline"
      color={palette.text}
      label={t('verse.picker.download', { name: tr.name, size: megabytes(s.bytes) })}
      onPress={() => void startDownload(tr)}
      testID={`translation-download-${tr.id}`}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 10,
  },
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
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: layoutV2.hairline,
  },
  text: { flex: 1, minWidth: 0, gap: 1 },
  action: { minWidth: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  empty: { paddingVertical: 24, textAlign: 'center' },
});
