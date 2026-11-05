// The E2E build's root (E2E builds only; index.ts wraps the app with it): waits
// for a launch link to set the clock before the app's first screen, and shows
// one small line at the foot of the screen with the app's time, the phone's zone
// and the E2E network state. Flows read it (id e2e-status) to check the clock
// took, and a failed flow's screenshots say what time the app thought it was.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import { e2eReady } from './install';
import { clockLabel, onClockChange } from './clock';
import { isOffline, onNetworkChange } from './network';
import NetInfo from '@react-native-community/netinfo';
import { paletteV2 } from '../../theme/v2';

function zoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '?';
  } catch {
    return '?';
  }
}

/** What NetInfo last said: false when it saw no connection (or no internet). */
let netInfoUp = true;

/**
 * "e2e 2026-11-03 00:30 America/Chicago", then " offline" while the E2E network
 * switch is off, and " · net down" while NetInfo sees no connection (which side
 * is stuck, when a flow waits for the app to come back online). Changes once a
 * minute at most otherwise.
 */
export function statusText(): string {
  return `e2e ${clockLabel()} ${zoneName()}${isOffline() ? ' offline' : ''}${netInfoUp ? '' : ' · net down'}`;
}

function Status() {
  const [text, setText] = useState(statusText);
  useEffect(() => {
    const update = () => setText(statusText());
    const timer = setInterval(update, 1000);
    const offClock = onClockChange(update);
    const offNet = onNetworkChange(update);
    const offNetInfo = NetInfo.addEventListener((s) => {
      netInfoUp = s.isConnected !== false && s.isInternetReachable !== false;
      update();
    });
    return () => {
      clearInterval(timer);
      offClock();
      offNet();
      offNetInfo();
    };
  }, []);
  return (
    <View pointerEvents="none" style={styles.status}>
      <Text testID="e2e-status" style={styles.text} allowFontScaling={false}>
        {text}
      </Text>
    </View>
  );
}

export function withE2E<P extends object>(App: React.ComponentType<P>): React.ComponentType<P> {
  return function E2ERoot(props: P) {
    const [ready, setReady] = useState(false);
    useEffect(() => {
      let live = true;
      e2eReady().then(() => live && setReady(true));
      return () => {
        live = false;
      };
    }, []);
    // Where the app's root sits in its window, in the app's log each time it
    // changes: Android once laid the window out a status bar's height too low
    // after a quick relaunch. A flow failing on that then says so.
    const root = useRef<View>(null);
    const onLayout = useCallback(() => {
      root.current?.measureInWindow((x, y, width, height) => {
        const w = Dimensions.get('window');
        const s = Dimensions.get('screen');
        // eslint-disable-next-line no-console
        console.log(
          `[e2e] layout: root at ${Math.round(x)},${Math.round(y)} ${Math.round(width)}×${Math.round(height)}; ` +
            `window ${Math.round(w.width)}×${Math.round(w.height)}, screen ${Math.round(s.width)}×${Math.round(s.height)}`,
        );
      });
    }, []);
    return (
      <View ref={root} style={styles.root} onLayout={onLayout}>
        {ready ? <App {...props} /> : null}
        <Status />
      </View>
    );
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Android can lay the window out a status bar's height too low after a quick
  // relaunch, which hid a line at the very foot: higher there.
  status: { position: 'absolute', left: 4, bottom: Platform.OS === 'android' ? 32 : 1 },
  // The light theme's grey reads on either ground; small enough to stay out of the way.
  text: { fontSize: 9, color: paletteV2(false).secondary },
});
