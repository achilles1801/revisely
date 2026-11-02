import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';

/**
 * Signed in, but this phone has no copy of the account yet and the server
 * can't be reached (the first launch after installing or signing in). It
 * carries on by itself once the server answers; "Try again" asks it now.
 */
export function ConnectToSetUp() {
  const { palette } = useTheme();
  const { retryConnection } = useApp();
  const { signOutUser } = useAuth();
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    if (!trying) return;
    const t = setTimeout(() => setTrying(false), 3_000);
    return () => clearTimeout(t);
  }, [trying]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]} testID="connect-to-set-up">
      <View style={styles.body}>
        <Ionicons name="cloud-offline-outline" size={40} color={palette.secondary} />
        <Text style={[typeV2.title, styles.title, { color: palette.text }]} accessibilityRole="header">
          Connect to the internet to set up
        </Text>
        <Text style={[typeV2.body, styles.text, { color: palette.secondary }]}>
          Revisely needs a connection once to load your account on this phone. After that it works offline.
        </Text>
        <PillButton
          title="Try again"
          busy={trying}
          onPress={() => {
            setTrying(true);
            retryConnection();
          }}
          style={styles.button}
          testID="connect-retry"
        />
        <Tap
          onPress={() => {
            signOutUser().catch(() => undefined);
          }}
          accessibilityRole="button"
          hitSlop={8}
          testID="connect-sign-out"
        >
          <Text style={[typeV2.meta, { color: palette.secondary }]}>Sign out</Text>
        </Tap>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layoutV2.gutter * 2,
    gap: 12,
  },
  title: { textAlign: 'center', marginTop: 4 },
  text: { textAlign: 'center' },
  button: { marginTop: 12, minWidth: 160 },
});
