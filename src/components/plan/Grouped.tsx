import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

/**
 * iOS Settings-style grouped inset list primitives.
 *
 *   <GroupedSection header="Cycle" footer="Tap a day to edit it.">
 *     <GroupedRow title="Today" subtitle="Juz 2 · 10 pages" accessory="chevron" />
 *   </GroupedSection>
 *
 * Sections draw hairline separators between rows automatically.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const GROUP_ROW_INSET = spacing.md;
export const GROUP_ICON_INSET = spacing.md + 28 + spacing.sm;

export function useGroupedStyles() {
  const { theme } = useTheme();
  return React.useMemo(() => makeStyles(theme), [theme]);
}

export function SectionHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const styles = useGroupedStyles();
  return (
    <View style={styles.headerRow}>
      <Text style={styles.headerText} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

export function SectionFooter({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'warning';
}) {
  const styles = useGroupedStyles();
  const { theme } = useTheme();
  return (
    <Text style={[styles.footerText, tone === 'warning' && { color: theme.warning }]}>
      {children}
    </Text>
  );
}

/** Small text button for section headers ("Edit" / "Done"). */
export function HeaderTextButton({
  label,
  onPress,
  bold = false,
}: {
  label: string;
  onPress: () => void;
  bold?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {({ pressed }) => (
        <Text
          style={{
            fontSize: 15,
            fontWeight: bold ? '600' : '400',
            color: theme.accent,
            opacity: pressed ? 0.5 : 1,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function GroupedSection({
  header,
  headerRight,
  footer,
  footerTone,
  separatorInset = GROUP_ROW_INSET,
  style,
  children,
}: {
  header?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  footerTone?: 'default' | 'warning';
  separatorInset?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const styles = useGroupedStyles();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.section, style]}>
      {header ? <SectionHeader title={header} right={headerRight} /> : null}
      {rows.length > 0 ? (
        <View style={styles.card}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          {rows.map((row, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <Separator inset={separatorInset} /> : null}
              {row}
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {footer ? (
        typeof footer === 'string' ? (
          <SectionFooter tone={footerTone}>{footer}</SectionFooter>
        ) : (
          footer
        )
      ) : null}
    </View>
  );
}

export function Separator({ inset = GROUP_ROW_INSET }: { inset?: number }) {
  const styles = useGroupedStyles();
  return (
    <View style={styles.separatorWrap}>
      <View style={[styles.separator, { marginLeft: inset }]} />
    </View>
  );
}

export interface GroupedRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  iconColor?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  accessory?: 'chevron' | 'check' | 'none';
  tone?: 'default' | 'accent' | 'destructive' | 'muted';
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  titleLines?: number;
  style?: StyleProp<ViewStyle>;
}

export function GroupedRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  leading,
  trailing,
  accessory = 'none',
  tone = 'default',
  onPress,
  onLongPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  titleLines = 1,
  style,
}: GroupedRowProps) {
  const { theme } = useTheme();
  const styles = useGroupedStyles();
  const interactive = !!(onPress || onLongPress) && !disabled;

  const titleColor =
    tone === 'destructive'
      ? theme.error
      : tone === 'accent'
        ? theme.accent
        : tone === 'muted'
          ? theme.textMuted
          : theme.textPrimary;

  const content = (
    <>
      {icon ? (
        <View style={styles.iconSlot}>
          <Ionicons
            name={icon}
            size={21}
            color={iconColor ?? (tone === 'destructive' ? theme.error : theme.accent)}
          />
        </View>
      ) : null}
      {leading}
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {accessory === 'chevron' ? (
        <Ionicons name="chevron-forward" size={17} color={theme.textMuted} style={styles.chevron} />
      ) : null}
      {accessory === 'check' ? (
        <Ionicons name="checkmark" size={20} color={theme.accent} style={styles.check} />
      ) : null}
    </>
  );

  if (!onPress && !onLongPress) {
    return (
      <View
        style={[styles.row, subtitle ? styles.rowTall : null, disabled && styles.disabled, style]}
        accessibilityLabel={accessibilityLabel}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              Haptics.selectionAsync();
              onPress();
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onLongPress();
            }
          : undefined
      }
      disabled={!interactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !interactive }}
      style={({ pressed }) => [
        styles.row,
        subtitle ? styles.rowTall : null,
        pressed && interactive && styles.rowPressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    section: {
      marginTop: spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      marginBottom: 6,
      minHeight: 20,
    },
    headerText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '400',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: theme.textMuted,
    },
    footerText: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.textMuted,
      paddingHorizontal: spacing.md,
      marginTop: 6,
    },
    card: {
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    separatorWrap: {
      backgroundColor: 'transparent',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      gap: spacing.sm,
      backgroundColor: 'transparent',
    },
    rowTall: {
      minHeight: 60,
    },
    rowPressed: {
      backgroundColor: theme.accent + '22',
    },
    disabled: {
      opacity: 0.4,
    },
    iconSlot: {
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '400',
      letterSpacing: -0.2,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.textSecondary,
      marginTop: 1,
    },
    value: {
      fontSize: 17,
      lineHeight: 22,
      color: theme.textMuted,
      maxWidth: '50%',
      textAlign: 'right',
    },
    chevron: {
      marginLeft: -2,
      marginRight: -4,
    },
    check: {
      marginRight: -2,
    },
  });
