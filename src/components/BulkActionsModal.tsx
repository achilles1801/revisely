import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { QuranPage } from '../types';
import { Sheet } from './v2/Sheet';
import { PillTabs } from './v2/PillTabs';
import { PillButton } from './v2/PillButton';
import { Mark } from './v2/Mark';
import { Tap } from './v2/Tap';
import { layoutV2, typeV2 } from '../theme/v2';

interface PageData {
  pageNumber: number;
  isCompleted: boolean;
  weaknessRating: number;
}

interface BulkActionsModalProps {
  visible: boolean;
  onClose: () => void;
  pages: PageData[];
  quranData: QuranPage[];
  onMarkAllComplete: () => void;
  onMarkAllIncomplete: () => void;
  onMarkJuzComplete: (juzNumber: number) => void;
  onTogglePage: (pageNumber: number) => void;
}

type TabType = 'juz' | 'pages';

export function BulkActionsModal({
  visible,
  onClose,
  pages,
  quranData,
  onMarkAllComplete,
  onMarkAllIncomplete,
  onMarkJuzComplete,
  onTogglePage,
}: BulkActionsModalProps) {
  const { palette } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('juz');

  const juzGroups = useMemo(() => {
    const groups: { [key: number]: PageData[] } = {};
    pages.forEach((page) => {
      const quranPage = quranData.find((q) => q.pageNumber === page.pageNumber);
      const juz = quranPage?.juzNumber || 1;
      if (!groups[juz]) groups[juz] = [];
      groups[juz].push(page);
    });
    return groups;
  }, [pages, quranData]);

  const allCompleted = pages.length > 0 && pages.every((p) => p.isCompleted);
  const completedCount = pages.filter((p) => p.isCompleted).length;

  // One row per juz or page: its mark (jade once done), name and count.
  const row = (key: string | number, mark: React.ReactNode, name: string, meta: string, done: boolean, onPress: () => void, label: string) => (
    <Tap
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ checked: done }}
      style={[v2.row, { borderBottomColor: palette.separator }]}
    >
      {mark}
      <View style={v2.rowText}>
        <Text style={[typeV2.name, { color: palette.text }]}>{name}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{meta}</Text>
      </View>
    </Tap>
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Manage pages"
      message={`${completedCount} of ${pages.length} complete`}
      right={{ label: 'Done', onPress: onClose, strong: true }}
      contentStyle={v2.content}
      testID="bulk-sheet"
    >
      <View style={v2.controls}>
        <PillTabs<TabType>
          options={[
            { value: 'juz', label: 'By juz' },
            { value: 'pages', label: 'All pages' },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
        <PillButton
          title={allCompleted ? 'Unmark all' : 'Mark all done'}
          variant={allCompleted ? 'outline' : 'solid'}
          onPress={allCompleted ? onMarkAllIncomplete : onMarkAllComplete}
        />
      </View>
      <ScrollView style={v2.list}>
        {activeTab === 'juz'
          ? Object.entries(juzGroups).map(([juzNum, juzPages]) => {
              const completed = juzPages.filter((p) => p.isCompleted).length;
              const full = completed === juzPages.length;
              return row(
                juzNum,
                <Mark size="reply" label={juzNum} done={full} />,
                `Juz ${juzNum}`,
                `${completed} of ${juzPages.length} pages`,
                full,
                () => onMarkJuzComplete(parseInt(juzNum, 10)),
                `Juz ${juzNum}, ${completed} of ${juzPages.length} pages. Mark all done`,
              );
            })
          : pages.map((page) => {
              const surah = quranData.find((q) => q.pageNumber === page.pageNumber)?.surahName || 'Surah';
              return row(
                page.pageNumber,
                <Mark size="reply" label={String(page.pageNumber)} done={page.isCompleted} />,
                `Page ${page.pageNumber}`,
                surah,
                page.isCompleted,
                () => onTogglePage(page.pageNumber),
                `Page ${page.pageNumber}, ${surah}${page.isCompleted ? ', revised' : ''}`,
              );
            })}
      </ScrollView>
    </Sheet>
  );
}

const v2 = StyleSheet.create({
  content: { flexShrink: 1 },
  controls: { gap: 10, paddingVertical: 8 },
  list: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: layoutV2.hairline },
  rowText: { flex: 1 },
});
