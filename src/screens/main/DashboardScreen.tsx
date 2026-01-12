import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { StatBox } from '../../components/StatBox';
import { EditSessionModal } from '../../components/EditSessionModal';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { generateDailyAssignment } from '../../lib/algorithm';
import { getQuranData, getJuzForPage } from '../../lib/quranData';
import { formatDateReadable } from '../../lib/utils';
import { scheduleDangerAlert, registerForPushNotificationsAsync } from '../../lib/notifications';
import { RevisionLog } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Dashboard'>;

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const { user, pages, logs, updateLog, deleteLog, loadData } = useApp();
  const { firebaseUser } = useAuth();

  const [selectedLog, setSelectedLog] = useState<RevisionLog | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSessionPages, setSelectedSessionPages] = useState<number[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const quranData = getQuranData();

  const assignment = useMemo(() => {
    if (!user) return null;
    return generateDailyAssignment(pages, quranData, user);
  }, [user, pages]);

  // Check if today has been completed
  const todayStatus = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);

    if (todayLogs.length === 0) {
      return { status: 'not_started', pagesCompleted: 0 };
    }

    // Sum up all pages revised today
    const pagesRevisedToday = new Set<number>();
    todayLogs.forEach(log => {
      log.pagesRevised.forEach(p => pagesRevisedToday.add(p));
    });

    const totalAssigned = assignment?.totalPages || 0;
    const completed = pagesRevisedToday.size;

    if (completed >= totalAssigned && totalAssigned > 0) {
      return { status: 'completed', pagesCompleted: completed };
    } else if (completed > 0) {
      return { status: 'partial', pagesCompleted: completed };
    }

    return { status: 'not_started', pagesCompleted: 0 };
  }, [logs, assignment]);

  // Calculate danger juz (pages not revised past danger threshold)
  const dangerJuz = useMemo(() => {
    if (!user) return [];
    const now = new Date();
    const dangerPages = pages.filter(p => {
      if (p.status !== 'memorized') return false;
      if (!p.lastRevisedDate) return true;
      const daysSinceRevision = (now.getTime() - new Date(p.lastRevisedDate).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceRevision > user.dangerThresholdDays;
    });

    const juzSet = new Set(dangerPages.map(p => getJuzForPage(p.pageNumber)));
    return Array.from(juzSet).sort((a, b) => a - b);
  }, [user, pages]);

  // Register for notifications and check danger alerts on mount
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  // Send danger alerts if enabled
  useEffect(() => {
    if (user?.dangerAlertEnabled && dangerJuz.length > 0) {
      scheduleDangerAlert(dangerJuz[0], true);
    }
  }, [user?.dangerAlertEnabled, dangerJuz]);

  // Calculate streak
  const calculatedStreak = useMemo(() => {
    if (logs.length === 0) return 0;

    const sortedLogs = [...logs].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < sortedLogs.length; i++) {
      const logDate = new Date(sortedLogs[i].date);
      logDate.setHours(0, 0, 0, 0);

      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - streak);

      if (logDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else if (logDate.getTime() < expectedDate.getTime()) {
        break;
      }
    }

    return streak;
  }, [logs]);

  // Get recent sessions for history display
  const recentSessions = useMemo(() => {
    return logs.slice(0, 7); // Last 7 sessions
  }, [logs]);

  // Get user's display name
  const userName = user?.name || firebaseUser?.displayName || '';

  
  if (!user || !assignment) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const today = new Date();
  const pagesThisWeek = pages.filter(
    p => p.lastRevisedDate &&
    new Date(p.lastRevisedDate) >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  ).length;

  const handleEditSession = (log: RevisionLog) => {
    // Get the pages that were part of this session (both revised and skipped)
    const sessionPages = [...log.pagesRevised, ...log.pagesSkipped].sort((a, b) => a - b);
    setSelectedLog(log);
    setSelectedSessionPages(sessionPages);
    setShowEditModal(true);
  };

  const handleSaveSession = async (updatedLog: RevisionLog) => {
    await updateLog(updatedLog);
    setShowEditModal(false);
    setSelectedLog(null);
    setSelectedSessionPages([]);
  };

  const handleDeleteSession = async () => {
    if (selectedLog) {
      await deleteLog(selectedLog.id);
      setShowEditModal(false);
      setSelectedLog(null);
      setSelectedSessionPages([]);
    }
  };

  const getRevisionCardContent = () => {
    if (todayStatus.status === 'completed') {
      return {
        badge: { bg: theme.success, text: 'Completed' },
        message: 'Excellent! You\'ve completed today\'s revision.',
        buttonText: 'View Session',
        buttonDisabled: false,
        showButton: true,
      };
    } else if (todayStatus.status === 'partial') {
      const remaining = assignment.totalPages - todayStatus.pagesCompleted;
      return {
        badge: { bg: theme.warning, text: 'In Progress' },
        message: `${remaining} page${remaining !== 1 ? 's' : ''} remaining for today.`,
        buttonText: 'Continue Revision',
        buttonDisabled: false,
        showButton: true,
      };
    } else {
      return {
        badge: dangerJuz.length > 0
          ? { bg: theme.warning, text: `${dangerJuz.length} juz need attention` }
          : { bg: theme.success, text: 'Ready' },
        message: 'Review your memorized pages to strengthen retention',
        buttonText: 'Start Revision',
        buttonDisabled: assignment.totalPages === 0,
        showButton: assignment.totalPages > 0,
      };
    }
  };

  const cardContent = getRevisionCardContent();

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
        {/* Header with greeting */}
        <View style={styles.header}>
          <Text style={[styles.date, { color: theme.textMuted }]}>{formatDateReadable(today)}</Text>
          <Text style={[styles.greeting, { color: theme.textPrimary }]}>
            Assalamu Alaikum{userName ? `, ${userName}` : ''}
          </Text>
        </View>

        {/* Danger Alert Banner */}
        {dangerJuz.length > 0 && todayStatus.status !== 'completed' && (
          <View style={[styles.dangerBanner, { backgroundColor: theme.warningBg, borderColor: theme.warning }]}>
            <Text style={[styles.dangerText, { color: theme.textPrimary }]}>
              Juz {dangerJuz.slice(0, 3).join(', ')}{dangerJuz.length > 3 ? ` +${dangerJuz.length - 3} more` : ''} overdue for revision
            </Text>
          </View>
        )}

        {/* Today's Revision Card */}
        <Card style={StyleSheet.flatten([styles.assignmentCard, { backgroundColor: theme.bgAlt, borderColor: theme.border }])}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>TODAY'S REVISION</Text>
          <View style={styles.assignmentHeader}>
            {todayStatus.status === 'completed' ? (
              <View style={styles.completedHeader}>
                <Ionicons name="checkmark-circle" size={32} color={theme.success} />
                <Text style={[styles.completedText, { color: theme.success }]}>All Done!</Text>
              </View>
            ) : (
              <>
                {assignment.juzBreakdown.length > 0 ? (
                  <Text style={[styles.juzNumber, { color: theme.textPrimary }]}>
                    Juz {assignment.juzBreakdown[0].juz}
                    {assignment.juzBreakdown.length > 1 ? ` +${assignment.juzBreakdown.length - 1}` : ''}
                  </Text>
                ) : (
                  <Text style={[styles.juzNumber, { color: theme.textPrimary }]}>No pages to revise</Text>
                )}
              </>
            )}
            <View style={[styles.badge, { backgroundColor: cardContent.badge.bg }]}>
              <Text style={styles.badgeText}>{cardContent.badge.text}</Text>
            </View>
          </View>

          {todayStatus.status !== 'completed' && (
            <Text style={[styles.pageCount, { color: theme.textSecondary }]}>
              {todayStatus.status === 'partial'
                ? `${todayStatus.pagesCompleted}/${assignment.totalPages} pages completed`
                : `${assignment.totalPages} pages · ~${assignment.estimatedMinutes} min`
              }
            </Text>
          )}

          <Text style={[styles.revisionHint, { color: theme.textMuted }]}>
            {cardContent.message}
          </Text>

          {cardContent.showButton && (
            <Button
              title={cardContent.buttonText}
              onPress={() => {
                if (todayStatus.status === 'completed') {
                  // Find today's log and open edit modal
                  const todayLog = logs.find(log => log.date === new Date().toISOString().split('T')[0]);
                  if (todayLog) handleEditSession(todayLog);
                } else {
                  navigation.navigate('ActiveRevision');
                }
              }}
              variant={todayStatus.status === 'completed' ? 'outline' : 'primary'}
              style={styles.beginButton}
              disabled={cardContent.buttonDisabled}
            />
          )}
        </Card>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatBox
            label="Day Streak"
            value={calculatedStreak}
            style={styles.statBox}
          />
          <StatBox
            label="Pages This Week"
            value={pagesThisWeek}
            style={styles.statBox}
          />
        </View>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <View style={styles.historySection}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Recent Sessions</Text>
            {recentSessions.map((log) => {
              const logDate = new Date(log.date);
              const isToday = log.date === new Date().toISOString().split('T')[0];
              const isYesterday = log.date === new Date(Date.now() - 86400000).toISOString().split('T')[0];

              let dateLabel = formatDateReadable(logDate);
              if (isToday) dateLabel = 'Today';
              else if (isYesterday) dateLabel = 'Yesterday';

              return (
                <TouchableOpacity
                  key={log.id}
                  style={[styles.sessionRow, { borderBottomColor: theme.border }]}
                  onPress={() => handleEditSession(log)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sessionInfo}>
                    <Text style={[styles.sessionDate, { color: theme.textPrimary }]}>{dateLabel}</Text>
                    <Text style={[styles.sessionPages, { color: theme.textSecondary }]}>
                      {log.pagesRevised.length} page{log.pagesRevised.length !== 1 ? 's' : ''} revised
                      {log.durationMinutes ? ` · ${log.durationMinutes} min` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Edit Session Modal */}
      {selectedLog && (
        <EditSessionModal
          visible={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedLog(null);
            setSelectedSessionPages([]);
          }}
          log={selectedLog}
          quranData={quranData}
          sessionPages={selectedSessionPages}
          onSave={handleSaveSession}
          onDelete={handleDeleteSession}
        />
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.bodyMedium,
  },
  header: {
    marginBottom: spacing.xl,
  },
  date: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  greeting: {
    ...typography.displaySmall,
  },
  dangerBanner: {
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  dangerText: {
    ...typography.bodyMedium,
  },
  assignmentCard: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1,
  },
  cardLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  completedText: {
    ...typography.displayMedium,
  },
  juzNumber: {
    ...typography.displayMedium,
    flex: 1,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 0,
  },
  badgeText: {
    ...typography.label,
    color: '#fff',
    fontSize: 10,
  },
  pageCount: {
    ...typography.bodyMedium,
    marginBottom: spacing.xs,
  },
  revisionHint: {
    ...typography.bodySmall,
    marginBottom: spacing.lg,
  },
  beginButton: {
    width: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statBox: {
    flex: 1,
  },
  historySection: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.bodyLarge,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDate: {
    ...typography.bodyMedium,
    fontWeight: '500',
    marginBottom: 2,
  },
  sessionPages: {
    ...typography.bodySmall,
  },
});
