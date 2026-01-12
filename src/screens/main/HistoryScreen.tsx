import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, FlatList, TouchableOpacity, Modal, Alert, RefreshControl } from 'react-native';
import { Header } from '../../components/Header';
import { StatBox } from '../../components/StatBox';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { formatDateReadable } from '../../lib/utils';
import { getJuzForPage, getSurahForPage } from '../../lib/quranData';
import { RevisionLog } from '../../types';

export default function HistoryScreen() {
  const { logs, deleteLog, loadData } = useApp();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);
  const [selectedLog, setSelectedLog] = useState<RevisionLog | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const handleDeleteSession = (logId: string) => {
    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this session? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLog(logId);
            setShowDetailModal(false);
            setSelectedLog(null);
          },
        },
      ]
    );
  };

  // Filter out sessions with no pages revised
  const validLogs = useMemo(() => {
    return logs.filter(log => log.pagesRevised.length > 0);
  }, [logs]);

  const pagesThisWeek = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return validLogs
      .filter(log => new Date(log.date) >= weekAgo)
      .reduce((sum, log) => sum + log.pagesRevised.length, 0);
  }, [validLogs]);

  const streak = useMemo(() => {
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      if (validLogs.some(log => log.date === dateStr)) {
        currentStreak++;
      } else if (i > 0) {
        break;
      }
    }

    return currentStreak;
  }, [validLogs]);

  const last7Days = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayLogs = validLogs.filter(log => log.date === dateStr);
      const totalPages = dayLogs.reduce((sum, log) => sum + log.pagesRevised.length, 0);
      days.push({
        date: dateStr,
        pages: totalPages,
        completed: totalPages > 0,
      });
    }
    return days;
  }, [validLogs]);

  const maxPages = Math.max(...last7Days.map(d => d.pages), 1);

  const handleViewDetails = (log: RevisionLog) => {
    setSelectedLog(log);
    setShowDetailModal(true);
  };

  const getSessionJuz = (log: RevisionLog): number[] => {
    const juzSet = new Set(log.pagesRevised.map(p => getJuzForPage(p)));
    return Array.from(juzSet).sort((a, b) => a - b);
  };

  const formatSessionTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
          />
        }
      >
        <Header title="History" />

        <View style={styles.statsSection}>
          <StatBox
            label="Pages This Week"
            value={pagesThisWeek}
            style={styles.statBox}
          />
          <StatBox
            label="Day Streak"
            value={streak}
            style={styles.statBox}
          />
        </View>

        <View style={styles.chartSection}>
          <Text style={[styles.chartTitle, { color: theme.textMuted }]}>LAST 7 DAYS</Text>
          <View style={styles.weekGrid}>
            {last7Days.map((day, index) => {
              const date = new Date(day.date);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
              return (
                <View key={index} style={styles.dayCell}>
                  <View style={[
                    styles.dayIndicator,
                    { borderColor: theme.border, backgroundColor: theme.bgAlt },
                    day.completed && { backgroundColor: theme.bgDark, borderColor: theme.bgDark }
                  ]}>
                    {day.completed && <Text style={[styles.dayCheckmark, { color: theme.textInverse }]}>✓</Text>}
                  </View>
                  <Text style={[styles.dayLabel, { color: theme.textMuted }]}>{dayName}</Text>
                  {day.pages > 0 && (
                    <Text style={[styles.dayPages, { color: theme.textSecondary }]}>{day.pages}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.logsSection}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Recent Sessions</Text>
          <FlatList
            data={validLogs.slice(0, 20)}
            scrollEnabled={false}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const juzNumbers = getSessionJuz(item);
              return (
                <TouchableOpacity
                  style={[styles.logRow, { borderBottomColor: theme.border }]}
                  onPress={() => handleViewDetails(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.logLeft}>
                    <Text style={[styles.logJuz, { color: theme.textPrimary }]}>
                      Juz {juzNumbers.slice(0, 2).join(', ')}
                      {juzNumbers.length > 2 ? ` +${juzNumbers.length - 2}` : ''}
                    </Text>
                    <Text style={[styles.logDate, { color: theme.textMuted }]}>{formatDateReadable(item.date)}</Text>
                  </View>
                  <View style={styles.logRight}>
                    <Text style={[styles.logPages, { color: theme.textPrimary }]}>{item.pagesRevised.length} pages</Text>
                    {item.durationMinutes && item.durationMinutes > 0 && (
                      <Text style={[styles.logDuration, { color: theme.textMuted }]}>{item.durationMinutes} min</Text>
                    )}
                  </View>
                  <Text style={[styles.logArrow, { color: theme.textMuted }]}>›</Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No revision sessions yet</Text>
                <Text style={[styles.emptySubtext, { color: theme.textMuted }]}>Complete your first session to see it here</Text>
              </View>
            }
          />
        </View>
      </ScrollView>

      {/* Session Detail Modal */}
      <Modal
        visible={showDetailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Session Details</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Text style={[styles.modalClose, { color: theme.accent }]}>Done</Text>
              </TouchableOpacity>
            </View>

            {selectedLog && (
              <ScrollView style={styles.modalScroll}>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>DATE</Text>
                  <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{formatDateReadable(selectedLog.date)}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>DURATION</Text>
                  <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                    {selectedLog.durationMinutes ? `${selectedLog.durationMinutes} minutes` : 'Not recorded'}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>PAGES REVISED ({selectedLog.pagesRevised.length})</Text>
                  <View style={styles.pagesGrid}>
                    {selectedLog.pagesRevised.sort((a, b) => a - b).map(page => (
                      <View key={page} style={[styles.pageChip, { backgroundColor: theme.bgDark }]}>
                        <Text style={[styles.pageChipText, { color: theme.textInverse }]}>{page}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {selectedLog.pagesSkipped.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, { color: theme.textMuted }]}>PAGES SKIPPED ({selectedLog.pagesSkipped.length})</Text>
                    <View style={styles.pagesGrid}>
                      {selectedLog.pagesSkipped.sort((a, b) => a - b).map(page => (
                        <View key={page} style={[styles.pageChip, { backgroundColor: theme.bgAlt, borderWidth: 1, borderColor: theme.border }]}>
                          <Text style={[styles.pageChipText, { color: theme.textMuted }]}>{page}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>JUZ COVERED</Text>
                  <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                    {getSessionJuz(selectedLog).map(j => `Juz ${j}`).join(', ')}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.deleteButton, { borderColor: theme.error }]}
                  onPress={() => handleDeleteSession(selectedLog.id)}
                >
                  <Text style={[styles.deleteButtonText, { color: theme.error }]}>Delete Session</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  statsSection: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statBox: {
    flex: 1,
  },
  chartSection: {
    marginBottom: spacing.xl,
  },
  chartTitle: {
    ...typography.label,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayIndicator: {
    width: 36,
    height: 36,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dayCheckmark: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  dayLabel: {
    ...typography.bodySmall,
    marginBottom: 2,
  },
  dayPages: {
    ...typography.label,
    fontSize: 10,
  },
  logsSection: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.md,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  logLeft: {
    flex: 1,
  },
  logJuz: {
    ...typography.bodyMedium,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  logDate: {
    ...typography.bodySmall,
  },
  logRight: {
    alignItems: 'flex-end',
    marginRight: spacing.sm,
  },
  logPages: {
    ...typography.bodyMedium,
    marginBottom: spacing.xs,
  },
  logDuration: {
    ...typography.bodySmall,
  },
  logArrow: {
    ...typography.displaySmall,
  },
  emptyState: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodyMedium,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    ...typography.bodySmall,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.displaySmall,
  },
  modalClose: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  modalScroll: {
    maxHeight: 400,
  },
  detailSection: {
    marginBottom: spacing.lg,
  },
  detailLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  detailValue: {
    ...typography.bodyMedium,
  },
  pagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pageChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 40,
    alignItems: 'center',
  },
  pageChipText: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  deleteButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  deleteButtonText: {
    ...typography.bodyMedium,
    fontWeight: '500',
  },
});

