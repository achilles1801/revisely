import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { GlassCard } from './GlassCard';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';

export interface OptionSheetSection<T extends string> {
  title?: string;
  options: Array<{ value: T; label: string }>;
}

/**
 * iOS-style pick-one sheet: grouped rows, trailing checkmark on the current
 * value, Cancel at the bottom. Selecting a row closes the sheet.
 */
export function OptionSheet<T extends string>({
  visible,
  title,
  sections,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  sections: OptionSheetSection<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.sm },
          ]}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
            {sections.map((section, si) => (
              <View key={si} style={styles.section}>
                {section.title && (
                  <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
                    {section.title}
                  </Text>
                )}
                <View style={[styles.group, { backgroundColor: theme.glass, borderColor: theme.border }]}>
                  {section.options.map((opt, i) => (
                    <PressableScale
                      key={opt.value}
                      onPress={() => {
                        onSelect(opt.value);
                        onClose();
                      }}
                      haptic="selection"
                      scale={0.99}
                    >
                      <View
                        style={[
                          styles.row,
                          i < section.options.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.border,
                          },
                        ]}
                      >
                        <Text style={[typography.bodyLarge, { color: theme.textPrimary, flex: 1 }]}>
                          {opt.label}
                        </Text>
                        {opt.value === value && (
                          <Ionicons name="checkmark" size={20} color={theme.accent} />
                        )}
                      </View>
                    </PressableScale>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
          <PressableScale
            onPress={onClose}
            haptic="light"
            style={[styles.cancel, { backgroundColor: theme.glass, borderColor: theme.border }]}
          >
            <Text style={[typography.bodyLarge, { color: theme.accent, fontWeight: '600' }]}>
              Cancel
            </Text>
          </PressableScale>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    overflow: 'hidden',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.titleMedium,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  section: { marginBottom: spacing.md },
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  group: { borderRadius: radius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  cancel: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
