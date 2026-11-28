import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { radiusV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { chosenTafsirBooks, TAFSIR_BOOKS, toggleBook } from '../../lib/revo/tafsirBooks';
import type { TafsirBook } from '../../lib/revo/types';
import { t } from '../../i18n';

/**
 * Settings → Revo AI → Tafsir (Revisely Dev, REVO-47): the books Revo answers about the Qur'an from, checked. A tap
 * chooses or drops a book (never the last one); All four chooses them all, and tapped again goes back to Ibn Kathir
 * alone. Each tap is kept at once on the server.
 */
export function TafsirBooksSheet({
  visible,
  onClose,
  books,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  books: readonly TafsirBook[] | undefined;
  onChange: (books: TafsirBook[]) => Promise<unknown>;
}) {
  const { palette } = useTheme();
  const [chosen, setChosen] = useState<TafsirBook[]>(() => chosenTafsirBooks(books));
  // Taps are kept one after another, in order; while any is on its way, the account's copy (a step behind) isn't shown.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saving = useRef(0);
  const latest = useRef(books);
  latest.current = books;
  const key = (books ?? []).join(',');
  useEffect(() => {
    if (saving.current === 0) setChosen(chosenTafsirBooks(books));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (next: TafsirBook[]) => {
    if (next.join(',') === chosen.join(',')) return;
    setChosen(next);
    saving.current++;
    queue.current = queue.current
      .then(() => onChange(next))
      .catch((err) => {
        setChosen(chosenTafsirBooks(latest.current));
        Alert.alert(t('settings.revo.mushafFailed'), (err as Error)?.message ?? t('common.tryAgainSentence'));
      })
      .finally(() => {
        saving.current--;
      });
  };
  const all = chosen.length === TAFSIR_BOOKS.length;

  const row = (id: string, label: string, subtitle: string, selected: boolean, onPress: () => void) => (
    <Tap
      key={id}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={`${label}, ${subtitle}`}
      accessibilityState={{ checked: selected }}
      style={styles.item}
      testID={`tafsir-book-${id}`}
    >
      <View style={styles.label}>
        <Text style={[typeV2.menu, { color: palette.text }]}>{label}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{subtitle}</Text>
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={palette.text} style={styles.check} /> : null}
    </Tap>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('settings.revo.tafsirTitle')}
      message={t('settings.revo.tafsirMessage')}
      scroll
      footer={{ label: t('settings.revo.tafsirDone'), onPress: onClose, testID: 'tafsir-books-done' }}
      contentStyle={styles.list}
      testID="tafsir-books-sheet"
    >
      {row('all', t('settings.revo.tafsirAll'), t('settings.revo.tafsirAllSub'), all, () => choose(all ? ['ibnKathir'] : [...TAFSIR_BOOKS]))}
      {TAFSIR_BOOKS.map((b) =>
        row(b, t(`revo.tafsir.book.${b}`), t(`settings.revo.tafsirSub.${b}`), chosen.includes(b), () => choose(toggleBook(chosen, b))),
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radiusV2.media,
  },
  label: { flex: 1 },
  check: { marginStart: 8 },
});
