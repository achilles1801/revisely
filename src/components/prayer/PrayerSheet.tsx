import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { arabicV2, layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { PillTabs } from '../v2/PillTabs';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { QiblaBody, qiblaAsking, useQiblaView } from '../qibla/QiblaSheet';
import { DAY_TIMES, PrayerName, setPrayerAlert, TimeName, usePrayerPrefs } from '../../lib/prayer/prefs';
import { countdown, formatTime, gregorianDate, hijriDate, methodLabel, TIME_LABELS } from '../../lib/prayer/times';
import { usePrayerTimes, PrayerTimesNow } from './usePrayerTimes';
import { usePrayerLocation } from './usePrayerLocation';
import { usePrayerNotifyPermission } from './usePrayerNotifyPermission';

export type PrayerTab = 'times' | 'qibla';

/**
 * Prayer: today's times and the Qibla, one sheet with two tabs. Home's compass
 * opens it on Qibla, the next-prayer line on Times (and Settings → Prayer on
 * either). Drags down to close, as every sheet.
 */
export function PrayerSheet({
  visible,
  tab,
  onTab,
  onClose,
  onOpenCalculation,
}: {
  visible: boolean;
  tab: PrayerTab;
  onTab: (tab: PrayerTab) => void;
  onClose: () => void;
  /** Calculation (method, Asr, adjustments): a screen of its own. */
  onOpenCalculation: () => void;
}) {
  const { user } = useApp();
  const times = usePrayerTimes(user);
  const qibla = useQiblaView(visible && tab === 'qibla');
  const location = usePrayerLocation(visible && tab === 'times', times.place != null);
  const permission = usePrayerNotifyPermission();
  const timesAsking = tab === 'times' && (location.status === 'needs-permission' || location.status === 'denied');
  const asking = tab === 'qibla' ? qiblaAsking(qibla.view) : timesAsking;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Prayer"
      footer={{ label: asking ? 'Not now' : 'Done', onPress: onClose, testID: 'prayer-done' }}
      testID="prayer-sheet"
    >
      <View style={styles.tabs}>
        <PillTabs<PrayerTab>
          options={[
            { value: 'times', label: 'Times' },
            { value: 'qibla', label: 'Qibla' },
          ]}
          value={tab}
          onChange={onTab}
          testID="prayer-tabs"
        />
      </View>
      {tab === 'qibla' ? (
        <QiblaBody view={qibla.view} onAllow={qibla.onAllow} onOpenSettings={qibla.onOpenSettings} onRetry={qibla.onRetry} />
      ) : times.place && times.today ? (
        <TimesBody
          times={times}
          onBell={(prayer, on) => {
            if (!on) setPrayerAlert(prayer, { on: false });
            else permission.ensure(() => setPrayerAlert(prayer, { on: true }));
          }}
          onOpenCalculation={onOpenCalculation}
        />
      ) : (
        <TimesLocation status={location.status} onAllow={location.allow} onOpenSettings={location.openSettings} onRetry={location.retry} />
      )}
      {permission.sheets}
    </Sheet>
  );
}

/** Today's six times, the next one picked out, and the way to the calculation. */
export function TimesBody({
  times,
  onBell,
  onOpenCalculation,
}: {
  times: PrayerTimesNow;
  onBell: (prayer: PrayerName, on: boolean) => void;
  onOpenCalculation: () => void;
}) {
  const { palette } = useTheme();
  const prefs = usePrayerPrefs();
  const { today, next, now, current, placeLabel, settings } = times;
  if (!today) return null;
  const hijri = hijriDate(now);
  const nextName = next ? TIME_LABELS[next.name].en : null;
  const nextIn = next ? countdown(next.time.getTime() - now.getTime()) : null;
  const isNextToday = next != null && today[next.name]?.getTime() === next.time.getTime();

  return (
    <View testID="prayer-times">
      <View style={styles.head}>
        {next ? (
          <Text style={[typeV2.title, typeV2.numeral, styles.centred, { color: palette.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header" testID="prayer-headline">
            <Text style={{ color: palette.accentText }}>{nextName}</Text> {nextIn}
          </Text>
        ) : null}
        <Text style={[typeV2.meta, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {hijri ? `${gregorianDate(now)} · ${hijri}` : gregorianDate(now)}
        </Text>
        {placeLabel ? (
          <View style={styles.place}>
            <Ionicons name="location-outline" size={13} color={palette.secondary} />
            <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {placeLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rows}>
        {DAY_TIMES.map((name, i) => {
          const at = today[name];
          const isNext = isNextToday && next!.name === name;
          const past = at != null && at.getTime() <= now.getTime() && name !== current;
          const sub = isNext ? nextIn : name === current ? 'Now' : null;
          return (
            <TimeRow
              key={name}
              name={name}
              time={at ? formatTime(at) : '—'}
              sub={sub}
              highlight={isNext}
              past={past}
              bell={name === 'sunrise' ? undefined : prefs.alerts[name as PrayerName].on}
              onBell={name === 'sunrise' ? undefined : (on) => onBell(name as PrayerName, on)}
              separator={i < DAY_TIMES.length - 1 && !isNext && !(isNextToday && DAY_TIMES[i + 1] === next!.name)}
            />
          );
        })}
      </View>
      <Tap onPress={onOpenCalculation} style={[styles.calc, { borderTopColor: palette.separator }]} accessibilityRole="button" testID="prayer-calculation">
        <Ionicons name="options-outline" size={24} color={palette.text} />
        <Text style={[typeV2.body, styles.calcLabel, { color: palette.text }]}>Calculation</Text>
        <Text style={[typeV2.body, styles.calcValue, { color: palette.secondary }]} numberOfLines={1}>
          {methodLabel(settings.method, true)} · {settings.madhab === 'hanafi' ? 'Hanafi' : 'Standard'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
      </Tap>
    </View>
  );
}

function TimeRow({
  name,
  time,
  sub,
  highlight,
  past,
  bell,
  onBell,
  separator,
}: {
  name: TimeName;
  time: string;
  sub: string | null;
  highlight: boolean;
  past: boolean;
  bell?: boolean;
  onBell?: (on: boolean) => void;
  separator: boolean;
}) {
  const { palette } = useTheme();
  const ink = highlight ? palette.subtleText : past ? palette.secondary : palette.text;
  const label = TIME_LABELS[name];
  return (
    <View
      style={[styles.row, highlight && { backgroundColor: palette.accentSubtle, borderRadius: radiusV2.media }]}
      testID={`prayer-row-${name}`}
      accessibilityLabel={`${label.en}, ${time}${sub ? `, ${sub}` : ''}`}
    >
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          <Text style={[typeV2.body, styles.name, highlight && styles.bold, { color: ink }]} maxFontSizeMultiplier={1.4}>
            {label.en}
          </Text>
          <Text style={[arabicV2(17), styles.arabic, { color: ink }]} maxFontSizeMultiplier={1.3}>
            {label.ar}
          </Text>
        </View>
        {sub ? (
          <Text style={[typeV2.meta, { color: highlight ? palette.subtleText : palette.secondary }]} maxFontSizeMultiplier={1.4}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Text style={[typeV2.body, typeV2.numeral, highlight && styles.bold, { color: ink }]} maxFontSizeMultiplier={1.4}>
        {time}
      </Text>
      {onBell ? (
        <Tap
          onPress={() => onBell(!bell)}
          hitSlop={8}
          style={styles.bell}
          accessibilityRole="switch"
          accessibilityLabel={`${label.en} notification`}
          accessibilityState={{ checked: !!bell }}
          testID={`prayer-bell-${name}`}
        >
          <Ionicons
            name={bell ? 'notifications-outline' : 'notifications-off-outline'}
            size={22}
            color={highlight ? palette.subtleText : bell ? palette.text : palette.secondary}
          />
        </Tap>
      ) : (
        <View style={styles.bell} />
      )}
      {separator ? <View style={[styles.separator, { backgroundColor: palette.separator }]} /> : null}
    </View>
  );
}

/** No place to work times out for yet: allow location, Settings, or try again. */
function TimesLocation({
  status,
  onAllow,
  onOpenSettings,
  onRetry,
}: {
  status: string;
  onAllow: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}) {
  const { palette } = useTheme();
  const title = (text: string) => (
    <Text style={[typeV2.barTitle, styles.centred, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
      {text}
    </Text>
  );
  const body = (text: string) => (
    <Text style={[typeV2.body, styles.centred, styles.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
      {text}
    </Text>
  );
  let content: React.ReactNode = null;
  let action: React.ReactNode = null;
  switch (status) {
    case 'needs-permission':
      content = (
        <>
          {title('Allow location for prayer times')}
          {body('Revisely works out the times for where you are. Your location stays on this phone.')}
        </>
      );
      action = <PillButton title="Allow location" size="lg" onPress={onAllow} testID="prayer-allow-location" />;
      break;
    case 'denied':
      content = (
        <>
          {title('Location is off for Revisely')}
          {body('Turn it on in Settings to see prayer times.')}
        </>
      );
      action = <PillButton title="Open Settings" size="lg" onPress={onOpenSettings} />;
      break;
    case 'no-location':
      content = (
        <>
          {title("Couldn't find where you are")}
          {body('Check that Location Services is on, then try again.')}
        </>
      );
      action = <PillButton title="Try again" variant="outline" size="lg" onPress={onRetry} />;
      break;
    default:
      content = title('Finding where you are…');
  }
  return (
    <View style={styles.locate} testID={`prayer-location-${status}`}>
      {content}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: 8 },
  head: { alignItems: 'center', paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 12, gap: 2 },
  centred: { textAlign: 'center' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rows: { paddingHorizontal: layoutV2.gutter - 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8, paddingLeft: 16, paddingRight: 8 },
  rowText: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 17, lineHeight: 22 },
  bold: { fontWeight: '600' },
  arabic: { marginTop: -4 },
  bell: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  separator: { position: 'absolute', left: 16, right: 16, bottom: 0, height: StyleSheet.hairlineWidth },
  calc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
    marginTop: 10,
    paddingHorizontal: layoutV2.gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  calcLabel: { flexShrink: 0 },
  calcValue: { flex: 1, textAlign: 'right' },
  locate: { alignItems: 'center', paddingHorizontal: layoutV2.gutter, paddingVertical: 28, gap: 6 },
  body: { maxWidth: 330 },
  action: { marginTop: 18, alignSelf: 'stretch' },
});
