// The E2E build's root (E2E builds only; index.ts wraps the app with it): waits
// for a launch link to set the clock before the app's first screen, and shows
// one small line at the foot of the screen with the app's time, the phone's zone
// and the E2E network state. Flows read it (id e2e-status) to check the clock
// took, and a failed flow's screenshots say what time the app thought it was.
// Its accessibility label also says whether the app still holds changes to send
// (./outboxStatus), which flows wait on before a script writes the server
// (.maestro/subflows/app-sent.yaml); the line on screen stays as it was, so
// screenshots don't change with it.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, GestureResponderEvent, Platform, StyleSheet, Text, View } from 'react-native';
import { touchLine } from './taps';
import { e2eReady } from './install';
import { clockLabel, onClockChange } from './clock';
import { isOffline, onNetworkChange } from './network';
import { e2eVerse, E2EVerse, onE2EVerse } from './demoTranslations';
import NetInfo from '@react-native-community/netinfo';
import { paletteV2 } from '../../theme/v2';
import { onOutboxChange, outboxText } from './outboxStatus';

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
  const [outbox, setOutbox] = useState(outboxText);
  useEffect(() => {
    const update = () => {
      setText(statusText());
      setOutbox(outboxText());
    };
    const timer = setInterval(update, 1000);
    const offClock = onClockChange(update);
    const offNet = onNetworkChange(update);
    const offNetInfo = NetInfo.addEventListener((s) => {
      netInfoUp = s.isConnected !== false && s.isInternetReachable !== false;
      update();
    });
    const offOutbox = onOutboxChange(update);
    return () => {
      clearInterval(timer);
      offClock();
      offNet();
      offNetInfo();
      offOutbox();
    };
  }, []);
  return (
    <View pointerEvents="none" style={styles.status}>
      <Text testID="e2e-status" style={styles.text} allowFontScaling={false} accessibilityLabel={`${text}${outbox}`}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The verse sheet a link asked for (demoTranslations: revisely://e2e/verse?ref=…&t=…), over the app,
 * as any account's: the real sheet and picker, with providers of its own (this root is outside the
 * app's). Loaded only when asked for, so the sheet's modules don't load before Firebase starts.
 */
function VerseOverlay() {
  const [verse, setVerse] = useState<E2EVerse | null>(e2eVerse);
  const [translationId, setTranslationId] = useState<string | undefined>(e2eVerse()?.translationId);
  useEffect(
    () =>
      onE2EVerse((v) => {
        setVerse(v);
        if (v) setTranslationId(v.translationId);
      }),
    [],
  );
  if (!verse) return null;
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { VerseSheet } = require('../../components/verse/VerseSheet') as typeof import('../../components/verse/VerseSheet');
  const { ThemeProvider } = require('../../context/ThemeContext') as typeof import('../../context/ThemeContext');
  const { DesignProvider } = require('../../design/DesignContext') as typeof import('../../design/DesignContext');
  const { SafeAreaProvider, initialWindowMetrics } = require('react-native-safe-area-context') as typeof import('react-native-safe-area-context');
  const { pageOfVerse } = require('../verses') as typeof import('../verses');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return (
    // Over the whole window, so the provider measures the window's insets: laid out after the app, it
    // had no height and gave a top inset of 0, and the expanded sheet ran up under iOS's status bar
    // (only here; the reader's sheet has the app's provider, at the root).
    <SafeAreaProvider
      key={verse.theme ?? 'as-saved'}
      initialMetrics={initialWindowMetrics}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <DesignProvider>
        <ThemeProvider>
          <VerseSheet
            verse={verse}
            translationId={translationId}
            everyTranslation
            accountId="e2e-verse"
            onChangeTranslation={setTranslationId}
            reciter={undefined}
            onChangeReciter={() => undefined}
            onNavigate={(v) => setVerse({ ...v, page: pageOfVerse(v) })}
            onClose={() => setVerse(null)}
          />
        </ThemeProvider>
      </DesignProvider>
    </SafeAreaProvider>
  );
}

// Every touch that reaches JavaScript on the app's root, in the app's log (./taps, touchLine).
/* eslint-disable no-console */
const logTouch = (kind: string) => (e: GestureResponderEvent) => console.log(touchLine(kind, e));
const onTouchStart = logTouch('start');
const onTouchEnd = logTouch('end');
const onTouchCancel = logTouch('cancel');
/* eslint-enable no-console */

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
      <View ref={root} style={styles.root} onLayout={onLayout} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}>
        {ready ? <App {...props} /> : null}
        {ready ? <VerseOverlay /> : null}
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
