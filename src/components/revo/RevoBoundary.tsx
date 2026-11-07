import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { logger } from '../../lib/logger';

function Broken() {
  const { palette } = useTheme();
  return (
    <View style={styles.wrap} testID="revo-broken" accessibilityLiveRegion="polite">
      <Text style={[styles.title, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
        Revo ran into a problem
      </Text>
      <Text style={[styles.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
        Close it and open it again. Your conversations are kept.
      </Text>
    </View>
  );
}

/**
 * Keeps an error inside Revo's sheet in the sheet: it says so there instead of taking the app
 * down (on build 32, an uncaught JS error can end as a native crash, REACT-NATIVE-10). It is
 * reported, and cleared when the sheet opens again (`resetKey`).
 */
export class RevoBoundary extends React.Component<{ resetKey: unknown; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    logger.error('Revo failed to draw', error, { where: 'revo' });
  }

  componentDidUpdate(prev: { resetKey: unknown }): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): React.ReactNode {
    return this.state.failed ? <Broken /> : this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 8 },
  title: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
});
