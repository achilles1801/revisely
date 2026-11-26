// The head of the Account page (ACCOUNT-4, ACCOUNT-5; Majd's boards, Nov 26 2026,
// `~/Documents/revisely-settings-mocks/account-v2/boards/B3-1-account`): the picture in Premium's ring, the name with
// the latest badge, the Premium pill, "Revising since …", the bar to the next badge (a tap opens the Badges sheet) and
// three figures: pages revised, the longest streak, time in Revisely. No email under the name.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { formatNumber, t } from '../../i18n';
import { badgeName, latestMilestone, nextMilestone, progressToNext, type Milestone } from '../../lib/badges';
import type { AccountJourney } from '../../lib/accountJourney';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { BadgeMark } from './BadgeMark';
import { ProfilePicture } from './ProfilePicture';

const CHROME_MAX = 1.4;

export function AccountHeader({
  name,
  initial,
  photoUrl,
  premium,
  since,
  journey,
  timeInApp,
  moment,
  onBadges,
  onPicture,
  pictureBusy = false,
}: {
  name: string;
  initial: string;
  photoUrl?: string | null;
  premium: boolean;
  /** "March 2026", or null for today. */
  since: string | null;
  journey: AccountJourney | null;
  timeInApp: string;
  /** A badge new since this phone last showed one (ACCOUNT-6): a halo and one line, this once. */
  moment: Milestone | null;
  onBadges: () => void;
  /** Changing the picture (where it can be changed). */
  onPicture?: () => void;
  /** The picture is being changed. */
  pictureBusy?: boolean;
}) {
  const { palette } = useTheme();
  const revised = journey?.pagesRevised ?? 0;
  const latest = journey ? latestMilestone(revised) : null;
  const next = journey ? nextMilestone(revised) : null;
  const fill = journey ? progressToNext(revised) : 0;
  const caption = !journey
    ? ' '
    : moment
      ? t('account.bar.newBadge', { badge: badgeName(moment) })
      : next == null
        ? t('account.bar.all')
        : latest == null
          ? t('account.bar.first', { count: next })
          : t('account.bar.next', { count: next - revised, n: formatNumber(next - revised), badge: badgeName(next) });
  const who = [name, premium ? t('account.premium') : null, latest ? badgeName(latest) : null].filter(Boolean).join(', '); // i18n-ignore (a list for VoiceOver)

  const picture = (
    <View style={pictureBusy ? styles.busy : null}>
      <ProfilePicture size={88} photoUrl={photoUrl} initial={initial} premium={premium} camera={!!onPicture} testID="account-picture" />
      {pictureBusy ? <ActivityIndicator style={StyleSheet.absoluteFill} color={palette.secondary} /> : null}
    </View>
  );
  return (
    <View style={[styles.wrap, { borderBottomColor: palette.separator }]} testID="account-header">
      <View style={styles.head} accessible accessibilityLabel={t('account.headerLabel', { who })}>
        {onPicture ? (
          <Tap onPress={onPicture} disabled={pictureBusy} accessibilityRole="button" accessibilityLabel={t('account.picture.change')} testID="account-picture-button">
            {picture}
          </Tap>
        ) : (
          picture
        )}
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={CHROME_MAX} testID="account-name">
            {name}
          </Text>
          {latest ? (
            <View style={[styles.nameBadge, moment ? { backgroundColor: palette.accentSubtle } : null]} testID="account-name-badge">
              <BadgeMark milestone={latest} size={22} number={false} />
            </View>
          ) : null}
        </View>
        {premium ? (
          <LinearGradient
            colors={palette.premium as unknown as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.pill}
            testID="account-premium"
          >
            <Ionicons name="sparkles" size={11} color={palette.onPremium} />
            <Text style={[styles.pillText, { color: palette.onPremium }]} maxFontSizeMultiplier={CHROME_MAX}>
              {t('account.premium')}
            </Text>
          </LinearGradient>
        ) : null}
        <Text style={[typeV2.meta, styles.center, { color: palette.secondary, marginTop: 8 }]} maxFontSizeMultiplier={CHROME_MAX}>
          {since ? t('account.since', { month: since }) : t('account.sinceToday')}
        </Text>
      </View>

      <Tap
        onPress={onBadges}
        disabled={!journey}
        accessibilityRole="button"
        accessibilityLabel={t('account.bar.label', { revised: formatNumber(revised), next: formatNumber(next ?? revised) })}
        style={styles.bar}
        testID="account-milestones"
      >
        <View style={styles.barRow}>
          {latest ? (
            <View style={moment ? [styles.halo, { backgroundColor: palette.accentSubtle }] : null}>
              <BadgeMark milestone={latest} size={32} testID="account-bar-latest" />
            </View>
          ) : (
            <View style={{ width: 32 }} />
          )}
          <View style={[styles.track, { backgroundColor: palette.track }]}>
            <LinearGradient
              colors={palette.progress as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.fill, { width: `${Math.round(fill * 1000) / 10}%`, minWidth: fill > 0 ? 6 : 0 }]}
            />
          </View>
          {next ? <BadgeMark milestone={next} size={32} locked testID="account-bar-next" /> : <View style={{ width: 32 }} />}
        </View>
        <Text
          style={[typeV2.meta, styles.center, { color: moment ? palette.accentText : palette.secondary, marginTop: 6 }]}
          maxFontSizeMultiplier={CHROME_MAX}
          testID="account-bar-caption"
        >
          {caption}
        </Text>
      </Tap>

      <View style={[styles.figures, { borderTopColor: palette.separator }]} testID="account-figures">
        <Figure value={journey ? formatNumber(revised) : '—'} label={t('account.figures.pagesRevised', { count: revised })} testID="account-pages-revised" />
        <Figure
          value={journey?.longestStreak != null ? t('account.figures.days', { count: journey.longestStreak }) : '—'}
          label={t('account.figures.longest')}
          testID="account-longest-streak"
        />
        <Figure value={timeInApp} label={t('account.figures.time')} testID="account-time" />
      </View>
    </View>
  );
}

function Figure({ value, label, testID }: { value: string; label: string; testID: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.figure} accessible accessibilityLabel={`${value} ${label}`} testID={testID}>
      <Text style={[styles.figureValue, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: layoutV2.hairline },
  busy: { opacity: 0.6 },
  head: { alignItems: 'center', paddingTop: 24, paddingHorizontal: layoutV2.gutter },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, maxWidth: '100%' },
  name: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center', flexShrink: 1 },
  nameBadge: { marginStart: 6, borderRadius: 14, padding: 3 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 9, borderRadius: 11, marginTop: 6 },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.1 },
  center: { textAlign: 'center' },
  bar: { alignSelf: 'center', width: 300, maxWidth: '90%', marginTop: 18 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  halo: { borderRadius: 23, padding: 7, margin: -7 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  figures: { flexDirection: 'row', marginTop: 20, paddingVertical: 14, borderTopWidth: layoutV2.hairline },
  figure: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  figureValue: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
});
