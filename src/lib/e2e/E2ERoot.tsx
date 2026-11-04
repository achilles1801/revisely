// The E2E build's root (E2E builds only; index.ts wraps the app with it): waits
// for a launch link to set the clock before the app's first screen, and shows
// one small line at the foot of the screen with the app's time, the phone's zone
// and the E2E network state. Flows read it (id e2e-status) to check the clock
// took, and a failed flow's screenshots say what time the app thought it was.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { e2eReady } from './install';
import { clockLabel, onClockChange } from './clock';
import { isOffline, onNetworkChange } from './network';
import { paletteV2 } from '../../theme/v2';

function zoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '?';
  } catch {
    return '?';
  }
}

/** "e2e 2026-11-03 00:30 America/Chicago" (+ " offline"). Changes once a minute at most. */
export function statusText(): string {
  return `e2e ${clockLabel()} ${zoneName()}${isOffline() ? ' offline' : ''}`;
}

function Status() {
  const [text, setText] = useState(statusText);
  useEffect(() => {
    const update = () => setText(statusText());
    const timer = setInterval(update, 1000);
    const offClock = onClockChange(update);
    const offNet = onNetworkChange(update);
    return () => {
      clearInterval(timer);
      offClock();
      offNet();
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
    return (
      <View style={styles.root}>
        {ready ? <App {...props} /> : null}
        <Status />
      </View>
    );
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  status: { position: 'absolute', left: 4, bottom: 1 },
  // The light theme's grey reads on either ground; small enough to stay out of the way.
  text: { fontSize: 9, color: paletteV2(false).secondary },
});
