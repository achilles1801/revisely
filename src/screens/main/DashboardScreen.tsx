import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { GlassCard } from '../../components/GlassCard';
import { LiquidGlassActionBar } from '../../components/LiquidGlassTabBar';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { EditSessionModal } from '../../components/EditSessionModal';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { generateDailyAssignment, getCurrentRevisionDay } from '../../lib/algorithm';
import {
  getQuranData,
  getJuzForPage,
  getJuzName,
  getSurahForPage,
} from '../../lib/quranData';
import { formatDateReadable } from '../../lib/utils';
import { registerForPushNotificationsAsync } from '../../lib/notifications';
import { RevisionLog } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Dashboard'>;

const COMPACT_SESSION_LIMIT = 3;

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme, isDark), [theme, isDark]);

  const { user, pages, logs, updateLog, deleteLog, deleteLogs, loadData, error } = useApp();
  const { firebaseUser } = useAuth();

  const [selectedLog, setSelectedLog] = useState<RevisionLog | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSessionPages, setSelectedSessionPages] = useState<number[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  const [juzFilter, setJuzFilter] = useState<number | null>(null);
  const [juzPickerOpen, setJuzPickerOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

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

  const todayStatus = useMemo(() => {
    const today = getCurrentRevisionDay(user);
    const todayLogs = logs.filter((log) => log.date === today);
    if (todayLogs.length === 0)
      return { status: 'not_started' as const, pagesCompleted: 0 };

    const pagesRevisedToday = new Set<number>();
    todayLogs.forEach((log) =>
      log.pagesRevised.forEach((p) => pagesRevisedToday.add(p)),
    );
    const totalAssigned = assignment?.totalPages || 0;
    const completed = pagesRevisedToday.size;
    if (completed >= totalAssigned && totalAssigned > 0) {
      return { status: 'completed' as const, pagesCompleted: completed };
    }
    if (completed > 0)
      return { status: 'partial' as const, pagesCompleted: completed };
    return { status: 'not_started' as const, pagesCompleted: 0 };
  }, [logs, assignment]);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  // Replace the tab bar with the selection action bar (Mail/Photos pattern).
  // Targets the Home tab descriptor so the custom LiquidGlassTabBar hides itself.
  useFocusEffect(
    useCallback(() => {
      navigation.getParent()?.setOptions({
        tabBarStyle: selectionMode ? { display: 'none' } : undefined,
      });
      return () => {
        navigation.getParent()?.setOptions({ tabBarStyle: undefined });
      };
    }, [selectionMode, navigation]),
  );

  const calculatedStreak = useMemo(() => {
    if (logs.length === 0) return 0;
    const sortedLogs = [...logs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
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

  // Sessions
  const sessionLogs = useMemo(
    () =>
      logs
        .filter((l) => l.pagesRevised.length > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [logs],
  );

  const filteredSessions = useMemo(() => {
    if (juzFilter === null) return sessionLogs;
    return sessionLogs.filter((log) =>
      log.pagesRevised.some((p) => getJuzForPage(p) === juzFilter),
    );
  }, [sessionLogs, juzFilter]);

  const visibleSessions = useMemo(
    () =>
      sessionsExpanded
        ? filteredSessions
        : filteredSessions.slice(0, COMPACT_SESSION_LIMIT),
    [filteredSessions, sessionsExpanded],
  );

  const availableJuz = useMemo(() => {
    const set = new Set<number>();
    for (const log of sessionLogs) {
      for (const p of log.pagesRevised) set.add(getJuzForPage(p));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [sessionLogs]);

  const userName = user?.name || firebaseUser?.displayName || '';

  if (!user || !assignment) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          {error ? (
            <>
              <Text style={styles.errorTitle}>Couldn't load your data</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <Button
                title="Try again"
                onPress={loadData}
                variant="primary"
                style={styles.retryButton}
              />
            </>
          ) : (
            <Text style={styles.loadingText}>Loading…</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const today = new Date();

  const handleEditSession = (log: RevisionLog) => {
    const sessionPages = [...log.pagesRevised, ...log.pagesSkipped].sort(
      (a, b) => a - b,
    );
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

  const enterSelectionMode = (initialId?: string) => {
    setSelectionMode(true);
    setSelectedSessionIds(initialId ? new Set([initialId]) : new Set());
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedSessionIds(new Set());
  };

  const toggleSessionSelection = (id: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSessionPress = (log: RevisionLog) => {
    if (selectionMode) {
      toggleSessionSelection(log.id);
    } else {
      handleEditSession(log);
    }
  };

  const handleSessionLongPress = (log: RevisionLog) => {
    if (!selectionMode) enterSelectionMode(log.id);
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedSessionIds);
    if (ids.length === 0) return;
    Alert.alert(
      `Delete ${ids.length} session${ids.length !== 1 ? 's' : ''}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLogs(ids);
            exitSelectionMode();
          },
        },
      ],
    );
  };

  const heroContent = (() => {
    if (todayStatus.status === 'completed') {
      return {
        eyebrow: 'Today',
        title: "You're done for today",
        subtitle: `Revised ${todayStatus.pagesCompleted} page${
          todayStatus.pagesCompleted !== 1 ? 's' : ''
        } · come back tomorrow`,
        ctaTitle: 'Review session',
      };
    }
    if (todayStatus.status === 'partial') {
      const remaining = assignment.totalPages - todayStatus.pagesCompleted;
      return {
        eyebrow: 'In progress',
        title: `${remaining} page${remaining !== 1 ? 's' : ''} to go`,
        subtitle: `${todayStatus.pagesCompleted} of ${assignment.totalPages} done so far`,
        ctaTitle: 'Continue revision',
      };
    }
    if (assignment.totalPages === 0) {
      return {
        eyebrow: 'All caught up',
        title: 'Nothing to revise yet',
        subtitle: 'Mark pages as memorized from Progress to begin.',
        ctaTitle: '',
      };
    }
    const primaryJuz = assignment.juzBreakdown[0]?.juz;
    const moreJuz = assignment.juzBreakdown.length - 1;
    return {
      eyebrow: "Today's revision",
      title: primaryJuz
        ? `Juz ${primaryJuz}${moreJuz > 0 ? ` + ${moreJuz} more` : ''}`
        : 'Ready when you are',
      subtitle: `${assignment.totalPages} page${
        assignment.totalPages !== 1 ? 's' : ''
      }`,
      ctaTitle: 'Start revision',
    };
  })();

  const handleCtaPress = () => {
    if (todayStatus.status === 'completed') {
      const todayLog = logs.find(
        (log) => log.date === getCurrentRevisionDay(user),
      );
      if (todayLog) handleEditSession(todayLog);
    } else {
      navigation.navigate('ActiveRevision');
    }
  };

  const renderHeroContent = () => (
    <>
      <View style={styles.heroTopRow}>
        <Text style={styles.heroEyebrow}>{heroContent.eyebrow}</Text>
        <View style={styles.heroTopRight}>
          {calculatedStreak > 0 && (
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={14} color={theme.gold} />
              <Text style={styles.streakBadgeText}>{calculatedStreak}</Text>
            </View>
          )}
          <PressableScale
            onPress={() => navigation.navigate('PlanEdit')}
            haptic="light"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Edit schedule"
          >
            <GlassCard
              style={styles.heroEditButton}
              tintColor={theme.accent + '33'}
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={theme.accent}
              />
            </GlassCard>
          </PressableScale>
        </View>
      </View>

      <Text style={styles.heroTitle}>{heroContent.title}</Text>
      <Text style={styles.heroSubtitle}>{heroContent.subtitle}</Text>

      {heroContent.ctaTitle && (
        <PressableScale
          onPress={handleCtaPress}
          haptic="medium"
          scale={0.97}
          style={styles.heroCta}
        >
          <Text style={styles.heroCtaText}>{heroContent.ctaTitle}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </PressableScale>
      )}
    </>
  );

  // Show filter chip only when there's enough variety to make filtering useful.
  const showFilterChip = availableJuz.length > 1;
  const showSeeAllToggle = filteredSessions.length > COMPACT_SESSION_LIMIT;
  const filterLabel = juzFilter === null ? 'All juz' : `Juz ${juzFilter}`;

  return (
    <SafeAreaView style={styles.container}>
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
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.date}>{formatDateReadable(today)}</Text>
            <View style={styles.greetingRow}>
              {userName ? (
                <Text
                  style={styles.greetingName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {userName}
                </Text>
              ) : null}
              <Text style={styles.greetingArabic}>السلام عليكم</Text>
            </View>
          </View>
          <PressableScale
            onPress={() => navigation.navigate('Settings')}
            haptic="light"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Open settings"
          >
            <GlassCard style={styles.settingsButton}>
              <Ionicons
                name="settings-outline"
                size={20}
                color={theme.textPrimary}
              />
            </GlassCard>
          </PressableScale>
        </View>

        {/* Hero — clear liquid glass lets the gradient lens through.
            elevated/specular sell the floating wet-glass surface. */}
        <View style={styles.heroCenter}>
          <GlassCard elevated specular style={styles.heroSurface}>
            {renderHeroContent()}
          </GlassCard>
        </View>

        {/* Sessions — hidden entirely when the user has no sessions yet. */}
        {sessionLogs.length > 0 && (
          <View style={styles.sessionsSection}>
            <View style={styles.sessionsHeader}>
              <Text style={styles.sessionsLabel}>RECENT SESSIONS</Text>
              <View style={styles.sessionsHeaderRight}>
                {showFilterChip && !selectionMode && (
                  <PressableScale
                    onPress={() => setJuzPickerOpen(true)}
                    haptic="light"
                  >
                    <GlassCard style={styles.filterChip}>
                      <Ionicons
                        name="filter-outline"
                        size={12}
                        color={theme.textSecondary}
                      />
                      <Text style={styles.filterChipText}>{filterLabel}</Text>
                      <Ionicons
                        name="chevron-down"
                        size={12}
                        color={theme.textMuted}
                      />
                    </GlassCard>
                  </PressableScale>
                )}
                <PressableScale
                  onPress={() =>
                    selectionMode ? exitSelectionMode() : enterSelectionMode()
                  }
                  haptic="light"
                  style={styles.selectChip}
                >
                  <Text style={styles.selectChipText}>
                    {selectionMode ? 'Cancel' : 'Select'}
                  </Text>
                </PressableScale>
              </View>
            </View>

            {visibleSessions.length === 0 ? (
              <Text style={styles.emptySessions}>
                No sessions match {filterLabel}
              </Text>
            ) : (
              <GlassCard elevated specular style={styles.sessionList}>
                {visibleSessions.map((log, idx, arr) => (
                  <SessionRow
                    key={log.id}
                    log={log}
                    isLast={idx === arr.length - 1}
                    theme={theme}
                    selectionMode={selectionMode}
                    isSelected={selectedSessionIds.has(log.id)}
                    onPress={() => handleSessionPress(log)}
                    onLongPress={() => handleSessionLongPress(log)}
                  />
                ))}
              </GlassCard>
            )}

            {showSeeAllToggle && (
              <PressableScale
                onPress={() => setSessionsExpanded((v) => !v)}
                haptic="light"
                scale={0.99}
                style={styles.seeAllBtn}
              >
                <Text style={styles.seeAllText}>
                  {sessionsExpanded
                    ? 'Show less'
                    : `See all ${filteredSessions.length}`}
                </Text>
                <Ionicons
                  name={sessionsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={theme.accent}
                />
              </PressableScale>
            )}
          </View>
        )}
      </ScrollView>

      {selectionMode && (
        <LiquidGlassActionBar>
          <Text style={[styles.selectionCount, { textAlign: 'left' }]}>
            {selectedSessionIds.size === 0
              ? 'Select sessions'
              : `${selectedSessionIds.size} selected`}
          </Text>
          <PressableScale
            onPress={handleBulkDelete}
            haptic="medium"
            disabled={selectedSessionIds.size === 0}
            style={[
              styles.actionDestructive,
              {
                backgroundColor:
                  selectedSessionIds.size === 0 ? 'transparent' : theme.error,
                opacity: selectedSessionIds.size === 0 ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={14}
              color={selectedSessionIds.size === 0 ? theme.textMuted : '#fff'}
            />
            <Text
              style={[
                styles.actionDestructiveLabel,
                {
                  color:
                    selectedSessionIds.size === 0 ? theme.textMuted : '#fff',
                },
              ]}
            >
              Delete
            </Text>
          </PressableScale>
        </LiquidGlassActionBar>
      )}

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

      <JuzPickerSheet
        visible={juzPickerOpen}
        onClose={() => setJuzPickerOpen(false)}
        availableJuz={availableJuz}
        currentValue={juzFilter}
        onSelect={(juz) => {
          setJuzFilter(juz);
          setJuzPickerOpen(false);
        }}
        theme={theme}
      />
    </SafeAreaView>
  );
}

function SessionRow({
  log,
  isLast,
  theme,
  onPress,
  onLongPress,
  selectionMode = false,
  isSelected = false,
}: {
  log: RevisionLog;
  isLast: boolean;
  theme: ThemeColors;
  onPress: () => void;
  onLongPress?: () => void;
  selectionMode?: boolean;
  isSelected?: boolean;
}) {
  const juzNumbers = useMemo(
    () =>
      Array.from(new Set(log.pagesRevised.map((p) => getJuzForPage(p)))).sort(
        (a, b) => a - b,
      ),
    [log.pagesRevised],
  );
  const surahNames = useMemo(() => {
    const seen = new Set<number>();
    const names: string[] = [];
    for (const pageNum of log.pagesRevised) {
      const surah = getSurahForPage(pageNum);
      if (!seen.has(surah.number)) {
        seen.add(surah.number);
        names.push(surah.name);
      }
    }
    return names;
  }, [log.pagesRevised]);

  const juzLabel = formatJuzLabel(juzNumbers);
  const surahLabel = formatSurahLabel(surahNames);
  const logDate = new Date(log.date);
  const monthDay = logDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const year = logDate.getFullYear().toString();

  const { isDark } = useTheme();
  const styles = useMemo(() => makeRowStyles(theme, isDark), [theme, isDark]);

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      haptic="light"
      scale={0.99}
      style={[styles.row, !isLast && styles.divider]}
    >
      {selectionMode && (
        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
          {isSelected && (
            <Ionicons name="checkmark" size={14} color={theme.textInverse} />
          )}
        </View>
      )}
      <View style={styles.info}>
        {juzLabel.length > 0 && <Text style={styles.primary}>{juzLabel}</Text>}
        {surahLabel.length > 0 && (
          <Text style={styles.secondary} numberOfLines={1}>
            {surahLabel}
          </Text>
        )}
      </View>
      <View style={styles.dateBox}>
        <Text style={styles.dateMonth}>{monthDay}</Text>
        <Text style={styles.dateYear}>{year}</Text>
      </View>
    </PressableScale>
  );
}

function formatJuzLabel(juzNumbers: number[]): string {
  if (juzNumbers.length === 0) return '';
  const visible = juzNumbers.slice(0, 2).join(', ');
  const more = juzNumbers.length > 2 ? ` +${juzNumbers.length - 2}` : '';
  return `Juz ${visible}${more}`;
}

function formatSurahLabel(surahNames: string[]): string {
  if (surahNames.length === 0) return '';
  const visible = surahNames.slice(0, 2).join(', ');
  const more = surahNames.length > 2 ? ` +${surahNames.length - 2}` : '';
  return `${visible}${more}`;
}

function JuzPickerSheet({
  visible,
  onClose,
  availableJuz,
  currentValue,
  onSelect,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  availableJuz: number[];
  currentValue: number | null;
  onSelect: (juz: number | null) => void;
  theme: ThemeColors;
}) {
  const sheetStyles = useMemo(() => makeSheetStyles(theme), [theme]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.overlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={sheetStyles.sheet}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={sheetStyles.dragHandle} />
          <Text style={sheetStyles.title}>Filter by juz</Text>
          <ScrollView style={sheetStyles.list}>
            <PressableScale
              onPress={() => onSelect(null)}
              haptic="selection"
              scale={0.99}
              style={[
                sheetStyles.option,
                currentValue === null && sheetStyles.optionSelected,
              ]}
            >
              <Text style={sheetStyles.optionText}>All juz</Text>
              {currentValue === null && (
                <Ionicons name="checkmark" size={18} color={theme.accent} />
              )}
            </PressableScale>
            {availableJuz.map((juz) => (
              <PressableScale
                key={juz}
                onPress={() => onSelect(juz)}
                haptic="selection"
                scale={0.99}
                style={[
                  sheetStyles.option,
                  currentValue === juz && sheetStyles.optionSelected,
                ]}
              >
                <View>
                  <Text style={sheetStyles.optionText}>Juz {juz}</Text>
                  <Text style={sheetStyles.optionMeta}>{getJuzName(juz)}</Text>
                </View>
                {currentValue === juz && (
                  <Ionicons name="checkmark" size={18} color={theme.accent} />
                )}
              </PressableScale>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    scrollView: { flex: 1 },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      // Clearance for the floating tab bar (~76px pill+gap) so content
      // scrolls behind it without being permanently hidden.
      paddingBottom: 96,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    loadingText: { ...typography.bodyMedium, color: theme.textSecondary },
    errorTitle: {
      ...typography.titleLarge,
      color: theme.textPrimary,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    errorMessage: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginBottom: spacing.xl,
      textAlign: 'center',
    },
    retryButton: { minWidth: 160 },

    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: spacing.xl,
      gap: spacing.sm,
    },
    headerText: { flex: 1, alignItems: 'flex-start' },
    date: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: spacing.xxs,
      textAlign: 'left',
    },
    greetingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.sm,
    },
    greetingArabic: {
      ...typography.displaySmall,
      color: theme.textPrimary,
      textAlign: 'left',
      writingDirection: 'ltr',
      // Arabic salam stays at full size; the name (left) shrinks first.
      flexShrink: 0,
    },
    greetingName: {
      ...typography.displaySmall,
      color: theme.textPrimary,
      textAlign: 'left',
      flexShrink: 1,
    },
    settingsButton: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },

    heroCenter: {
      flex: 1,
      justifyContent: 'center',
      marginVertical: spacing.lg,
    },
    heroSurface: {
      borderRadius: radius.lg,
      padding: spacing.xl,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    heroTopRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    heroEditButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroEyebrow: {
      ...typography.label,
      color: theme.accent,
      letterSpacing: 0.8,
    },
    streakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
      backgroundColor: theme.gold + '1F',
    },
    streakBadgeText: {
      ...typography.bodySmall,
      color: theme.gold,
      fontWeight: '700',
    },
    heroTitle: {
      ...typography.displayMedium,
      color: theme.textPrimary,
      marginBottom: spacing.xs,
    },
    heroSubtitle: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginBottom: spacing.xl,
    },
    heroCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      backgroundColor: theme.accent,
    },
    heroCtaText: {
      ...typography.titleSmall,
      fontWeight: '700',
      letterSpacing: 0.2,
      color: '#fff',
    },

    sessionsSection: { marginTop: spacing.sm },
    sessionsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    sessionsHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    selectChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
    },
    selectChipText: {
      ...typography.bodySmall,
      fontSize: 14,
      color: theme.accent,
      fontWeight: '600',
    },
    selectionCount: {
      ...typography.bodyMedium,
      fontSize: 14,
      color: theme.textPrimary,
      fontWeight: '600',
      flex: 1,
      textAlign: 'center',
    },
    actionDestructive: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    actionDestructiveLabel: {
      ...typography.bodySmall,
      fontSize: 14,
      fontWeight: '700',
    },
    sessionsLabel: {
      ...typography.label,
      color: theme.textMuted,
      letterSpacing: 0.8,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    filterChipText: {
      ...typography.bodySmall,
      fontSize: 11,
      color: theme.textPrimary,
      fontWeight: '600',
    },
    sessionList: {
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    emptySessions: {
      ...typography.bodySmall,
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      borderRadius: radius.md,
    },
    seeAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
    },
    seeAllText: {
      ...typography.bodySmall,
      color: theme.accent,
      fontWeight: '600',
    },
  });

const makeRowStyles = (theme: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    divider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    info: { flex: 1 },
    primary: {
      ...typography.titleSmall,
      color: theme.textPrimary,
    },
    secondary: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      marginTop: 2,
    },
    dateBox: {
      alignItems: 'flex-end',
      marginLeft: spacing.md,
    },
    dateMonth: {
      ...typography.titleSmall,
      color: theme.textPrimary,
      fontWeight: '700',
    },
    dateYear: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: radius.xs,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
  });

const makeSheetStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      maxHeight: '75%',
      overflow: 'hidden',
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: radius.full,
      alignSelf: 'center',
      marginBottom: spacing.md,
      backgroundColor: theme.border,
    },
    title: {
      ...typography.titleMedium,
      color: theme.textPrimary,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    list: { paddingHorizontal: spacing.lg },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    optionSelected: { backgroundColor: theme.accentSoft },
    optionText: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      fontWeight: '600',
    },
    optionMeta: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
