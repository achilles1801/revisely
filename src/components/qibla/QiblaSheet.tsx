import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { formatBearing, formatDistance, isAligned, relativeAngle, turnText } from '../../lib/qibla';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { Sheet } from '../v2/Sheet';
import { DialMode, QiblaDial } from './QiblaDial';
import { QiblaReading, useQibla } from './useQibla';

/** Below this heading accuracy (0–3) "Facing the Qibla" isn't claimed. */
const TRUST_ACCURACY = 2;

/** What the sheet shows: one of the mocks' states (B1–B4) or a fallback. */
export type QiblaView =
  | { kind: 'checking' }
  | { kind: 'permission' }
  | { kind: 'denied' }
  | { kind: 'locating' }
  | { kind: 'noLocation' }
  | { kind: 'atKaaba'; place: string | null }
  | { kind: 'static'; bearing: number; distanceKm: number; place: string | null; waiting: boolean }
  | { kind: 'calibrate'; bearing: number; heading: number | null }
  | { kind: 'turn'; bearing: number; heading: number; relative: number; distanceKm: number; place: string | null }
  | { kind: 'aligned'; bearing: number; heading: number; distanceKm: number; place: string | null };

/** The reading, as one state. `aligned` is the hysteresis-held "facing it". */
export function qiblaView(r: Omit<QiblaReading, 'allow' | 'openSettings' | 'retry'>, aligned: boolean): QiblaView {
  switch (r.status) {
    case 'checking':
      return { kind: 'checking' };
    case 'needs-permission':
      return { kind: 'permission' };
    case 'denied':
      return { kind: 'denied' };
    case 'locating':
      return { kind: 'locating' };
    case 'no-location':
      return { kind: 'noLocation' };
  }
  if (r.bearing == null || r.distanceKm == null) return { kind: 'locating' };
  if (r.atKaaba) return { kind: 'atKaaba', place: r.place };
  const live = r.heading.kind === 'live' ? r.heading : null;
  if (r.calibrating) return { kind: 'calibrate', bearing: r.bearing, heading: live?.heading ?? null };
  if (!live) {
    return {
      kind: 'static',
      bearing: r.bearing,
      distanceKm: r.distanceKm,
      place: r.place,
      waiting: r.heading.kind === 'waiting',
    };
  }
  if (aligned) {
    return { kind: 'aligned', bearing: r.bearing, heading: live.heading, distanceKm: r.distanceKm, place: r.place };
  }
  return {
    kind: 'turn',
    bearing: r.bearing,
    heading: live.heading,
    relative: relativeAngle(r.bearing, live.heading),
    distanceKm: r.distanceKm,
    place: r.place,
  };
}

/**
 * The Qibla compass, a sheet opened from Home's top bar. Like every sheet it
 * closes by dragging its handle or header down, tapping outside, or Done.
 */
export function QiblaSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const reading = useQibla(visible);
  const haptics = useHaptics();

  // Facing it: entered within ±3° (with a trustworthy compass), left past ±5°.
  const alignedRef = useRef(false);
  const live = reading.heading.kind === 'live' ? reading.heading : null;
  const canAlign =
    reading.status === 'ready' && !reading.atKaaba && !reading.calibrating && reading.bearing != null && live != null;
  const aligned =
    canAlign && live!.accuracy >= TRUST_ACCURACY
      ? isAligned(relativeAngle(reading.bearing!, live!.heading), alignedRef.current)
      : false;
  useEffect(() => {
    // One light tap on facing it, not on every reading while it stays so.
    if (aligned && !alignedRef.current) haptics.light();
    alignedRef.current = aligned;
  }, [aligned, haptics]);
  useEffect(() => {
    if (!visible) alignedRef.current = false;
  }, [visible]);

  const view = qiblaView(reading, aligned);
  return (
    <QiblaContent
      visible={visible}
      onClose={onClose}
      view={view}
      onAllow={reading.allow}
      onOpenSettings={reading.openSettings}
      onRetry={reading.retry}
    />
  );
}

/** The sheet for one state: the dial over a few lines, as the mocks draw it. */
export function QiblaContent({
  visible,
  onClose,
  view,
  onAllow,
  onOpenSettings,
  onRetry,
}: {
  visible: boolean;
  onClose: () => void;
  view: QiblaView;
  onAllow: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}) {
  const { palette } = useTheme();
  const asking = view.kind === 'permission' || view.kind === 'denied';
  const small =
    view.kind === 'checking' || asking || view.kind === 'locating' || view.kind === 'noLocation';

  let mode: DialMode = 'location';
  let bearing = 0;
  let heading: number | null = null;
  if (view.kind === 'turn' || view.kind === 'aligned') {
    mode = view.kind;
    bearing = view.bearing;
    heading = view.heading;
  } else if (view.kind === 'calibrate') {
    mode = 'calibrate';
    bearing = view.bearing;
    heading = view.heading;
  } else if (view.kind === 'static') {
    mode = 'static';
    bearing = view.bearing;
  } else if (view.kind === 'atKaaba') {
    mode = 'atKaaba';
  }

  const facts = (b: number, km: number) => `${formatBearing(b)} from north · ${formatDistance(km)} to Makkah`;
  const title = (text: string, color = palette.text) => (
    <Text
      style={[typeV2.barTitle, typeV2.numeral, styles.centred, { color }]}
      accessibilityRole="header"
      accessibilityLiveRegion="polite"
      maxFontSizeMultiplier={1.4}
      testID="qibla-title"
    >
      {text}
    </Text>
  );
  const line = (text: string) => (
    <Text style={[typeV2.meta, typeV2.numeral, styles.centred, styles.line, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
      {text}
    </Text>
  );
  const body = (text: string) => (
    <Text style={[typeV2.body, styles.centred, styles.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
      {text}
    </Text>
  );
  const place = (name: string | null) =>
    name ? (
      <View style={styles.place} testID="qibla-place">
        <Ionicons name="location-outline" size={13} color={palette.secondary} />
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {name}
        </Text>
      </View>
    ) : null;

  let text: React.ReactNode = null;
  let action: React.ReactNode = null;
  switch (view.kind) {
    case 'turn':
      text = (
        <>
          {title(turnText(view.relative))}
          {line(facts(view.bearing, view.distanceKm))}
          {place(view.place)}
        </>
      );
      break;
    case 'aligned':
      text = (
        <>
          {title('Facing the Qibla', palette.doneText)}
          {line(facts(view.bearing, view.distanceKm))}
          {place(view.place)}
        </>
      );
      break;
    case 'calibrate':
      text = (
        <>
          {title('Calibrate your compass')}
          {body('Move your phone in a figure 8 a few times, away from metal and magnets.')}
        </>
      );
      break;
    case 'static':
      // No compass (or none yet): the direction as a bearing from north.
      text = (
        <>
          {title(`${formatBearing(view.bearing)} from north`)}
          {line(view.waiting ? `Finding north… · ${formatDistance(view.distanceKm)} to Makkah` : `${formatDistance(view.distanceKm)} to Makkah`)}
          {place(view.place)}
        </>
      );
      break;
    case 'atKaaba':
      text = (
        <>
          {title("You're at the Kaaba")}
          {place(view.place)}
        </>
      );
      break;
    case 'permission':
      text = (
        <>
          {title('Allow location to find the Qibla')}
          {body('Revisely works out the direction of Makkah from where you are. Your location stays on this phone.')}
        </>
      );
      action = <PillButton title="Allow location" size="lg" onPress={onAllow} testID="qibla-allow" />;
      break;
    case 'denied':
      text = (
        <>
          {title('Location is off for Revisely')}
          {body('Turn it on in Settings to find the Qibla.')}
        </>
      );
      action = <PillButton title="Open Settings" size="lg" onPress={onOpenSettings} testID="qibla-settings" />;
      break;
    case 'locating':
      text = title('Finding where you are…');
      break;
    case 'checking':
      break;
    case 'noLocation':
      text = (
        <>
          {title("Couldn't find where you are")}
          {body('Check that Location Services is on, then try again.')}
        </>
      );
      action = <PillButton title="Try again" variant="outline" size="lg" onPress={onRetry} testID="qibla-retry" />;
      break;
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Qibla"
      footer={{ label: asking ? 'Not now' : 'Done', onPress: onClose, testID: 'qibla-done' }}
      testID="qibla-sheet"
    >
      <View style={styles.content} testID={`qibla-${view.kind}`}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dial}>
          <QiblaDial size={small ? 220 : 300} mode={mode} bearing={bearing} heading={heading} />
        </View>
        <View style={styles.text}>{text}</View>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 6 },
  dial: { paddingTop: 6 },
  text: { marginTop: 2, alignItems: 'center', paddingHorizontal: layoutV2.gutter },
  centred: { textAlign: 'center' },
  line: { marginTop: 4 },
  body: { marginTop: 6, maxWidth: 330 },
  place: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 2 },
  action: { marginTop: 20 },
});
