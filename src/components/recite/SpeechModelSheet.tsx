import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  downloadModel,
  formatModelSize,
  ModelDownload,
  NotEnoughSpaceError,
} from '../../lib/recite/speechModel';
import { logger } from '../../lib/logger';

interface SpeechModelSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The model is on the device. */
  onReady: () => void;
}

/** First use: what recitation checking does, and the one-time model download. */
export function SpeechModelSheet({ visible, onClose, onReady }: SpeechModelSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const download = useRef<ModelDownload | null>(null);

  useEffect(() => {
    if (!visible) {
      download.current?.cancel();
      download.current = null;
      setProgress(null);
      setError(null);
    }
  }, [visible]);

  const start = () => {
    setError(null);
    setProgress(0);
    const d = downloadModel((p) => setProgress(p));
    download.current = d;
    d.promise
      .then(() => {
        if (download.current !== d) return;
        download.current = null;
        onReady();
      })
      .catch((err) => {
        if (download.current !== d) return;
        download.current = null;
        setProgress(null);
        if (err instanceof NotEnoughSpaceError) {
          setError(`Free up ${formatModelSize()} or more on this iPhone, then try again.`);
        } else {
          logger.warn('Speech model download failed', err);
          setError('The download didn’t finish. Check your connection and try again.');
        }
      });
  };

  const cancel = () => {
    download.current?.cancel();
    download.current = null;
    setProgress(null);
  };

  const downloading = progress != null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessible={false} onPress={downloading ? undefined : onClose}>
        <Pressable
          accessible={false}
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={[styles.badge, { backgroundColor: theme.accent + '22' }]}>
            <Ionicons name="mic" size={26} color={theme.accent} />
          </View>
          <Text style={[typography.titleLarge, styles.center, { color: theme.textPrimary }]}>
            Check your recitation
          </Text>
          <Text style={[typography.bodyMedium, styles.center, styles.body, { color: theme.textSecondary }]}>
            Recite from memory and Revisely follows along, word by word. Missed and wrong words are marked on the
            page as you go.
          </Text>
          <View style={[styles.group, { backgroundColor: theme.glass, borderColor: theme.border }]}>
            <Point icon="phone-portrait-outline" text="Works on this iPhone, even offline. Your voice never leaves it." />
            <Point icon="eye-off-outline" text="Hide the words to test yourself; they appear as you recite." />
            <Point
              icon="cloud-download-outline"
              text={`Needs a one-time download of the recognition model (${formatModelSize()}). Wi-Fi recommended.`}
            />
          </View>

          {error && <Text style={[typography.bodySmall, styles.center, { color: theme.error }]}>{error}</Text>}

          {downloading ? (
            <View style={styles.progressWrap}>
              <View style={[styles.track, { backgroundColor: theme.border }]}>
                <View
                  style={[styles.fill, { backgroundColor: theme.accent, width: `${Math.round((progress ?? 0) * 100)}%` }]}
                />
              </View>
              <View style={styles.progressRow}>
                <Text style={[typography.caption, { color: theme.textMuted }]}>
                  Downloading… {Math.round((progress ?? 0) * 100)}%
                </Text>
                <Pressable onPress={cancel} hitSlop={8} accessibilityRole="button">
                  <Text style={[typography.caption, { color: theme.accent, fontWeight: '600' }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <PressableScale
                onPress={start}
                haptic="medium"
                scale={0.98}
                style={[styles.primary, { backgroundColor: theme.accent }]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>Download ({formatModelSize()})</Text>
              </PressableScale>
              <PressableScale onPress={onClose} haptic="light" style={styles.secondary} accessibilityRole="button">
                <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>Not now</Text>
              </PressableScale>
            </>
          )}
          <Text style={[typography.caption, styles.center, styles.credit, { color: theme.textMuted }]}>
            Speech recognition: Tarteel’s open Qur’an model (Apache 2.0), run with whisper.cpp.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={18} color={theme.accent} />
      <Text style={[typography.bodySmall, { color: theme.textPrimary, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    overflow: 'hidden',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  badge: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  center: { textAlign: 'center' },
  body: { marginTop: -spacing.xs },
  group: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  progressWrap: { gap: spacing.xs, paddingVertical: spacing.sm },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  primary: { height: 52, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondary: { height: 40, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.xs },
  credit: { marginTop: -spacing.xs },
});
