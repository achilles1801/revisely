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
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useDesign } from '../../design/DesignContext';
import { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { layoutV2, typeV2 } from '../../theme/v2';

/**
 * iOS Settings-style grouped inset list primitives.
 *
 *   <GroupedSection header="Cycle" footer="Tap a day to edit it.">
 *     <GroupedRow title="Today" subtitle="Juz 2 · 10 pages" accessory="chevron" />
 *   </GroupedSection>
 *
 * Sections draw hairline separators between rows automatically.
 *
 * In the new design (useDesign().isNew) they read like v2 Settings: no card,
 * rows flat on the ground with a 16pt gutter and 0.5pt separators, a bold
 * sentence-case header, a 13pt footer, a hairline closing the section. Taps
 * dim instead of buzzing.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const GROUP_ROW_INSET = spacing.md;
export const GROUP_ICON_INSET = spacing.md + 28 + spacing.sm;

export function useGroupedStyles() {
  const { theme } = useTheme();
  return React.useMemo(() => makeStyles(theme), [theme]);
}

/** Where the new design's separators start by default: the gutter. */
export const GROUP_ROW_INSET_V2 = layoutV2.gutter;

export function SectionHeader({
  title,
  right,
  collapsed,
  onToggle,
}: {
  title: string;
  right?: React.ReactNode;
  /** With `onToggle`, the title becomes a tap target with a chevron. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const styles = useGroupedStyles();
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  if (isNew) {
    const text = (
      <Text
        style={[typeV2.name, { color: palette.text }]}
        accessibilityRole={onToggle ? undefined : 'header'}
        maxFontSizeMultiplier={1.4}
      >
        {title}
      </Text>
    );
    return (
      <View style={v2.headerRow}>
        {onToggle ? (
          <Tap
            onPress={onToggle}
            hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${collapsed ? 'collapsed' : 'expanded'}`}
            accessibilityHint={collapsed ? 'Shows the section' : 'Hides the section'}
            accessibilityState={{ expanded: !collapsed }}
            style={v2.headerToggle}
            testID={`section-toggle-${title}`}
          >
            {text}
            <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={palette.secondary} />
          </Tap>
        ) : (
          text
        )}
        {right}
      </View>
    );
  }
  return (
    <View style={styles.headerRow}>
      {onToggle ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onToggle();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${collapsed ? 'collapsed' : 'expanded'}`}
          accessibilityHint={collapsed ? 'Shows the section' : 'Hides the section'}
          accessibilityState={{ expanded: !collapsed }}
          style={({ pressed }) => [styles.headerToggle, pressed && { opacity: 0.5 }]}
        >
          <Text style={styles.headerText}>{title}</Text>
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-down'}
            size={13}
            color={theme.textMuted}
          />
        </Pressable>
      ) : (
        <Text style={styles.headerText} accessibilityRole="header">
          {title}
        </Text>
      )}
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
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  if (isNew) {
    // A warning is advice, not an error (red is for errors and deleting):
    // full ink, so it stands out from the grey footers.
    return (
      <Text style={[typeV2.meta, v2.footer, { color: tone === 'warning' ? palette.text : palette.secondary }]}>
        {children}
      </Text>
    );
  }
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
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  if (isNew) {
    // A link, like "See all".
    return (
      <Tap
        onPress={onPress}
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[typeV2.body, bold && v2.bold, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
          {label}
        </Text>
      </Tap>
    );
  }
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
  separatorInset,
  style,
  collapsed = false,
  onToggleCollapsed,
  collapsedFooter,
  divider = true,
  children,
}: {
  header?: string;
  headerRight?: React.ReactNode;
  /** Collapsible sections hide their rows (and swap in `collapsedFooter`). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  collapsedFooter?: React.ReactNode;
  footer?: React.ReactNode;
  footerTone?: 'default' | 'warning';
  separatorInset?: number;
  style?: StyleProp<ViewStyle>;
  /** New design: a hairline closes the section (off for the last one in a sheet). */
  divider?: boolean;
  children: React.ReactNode;
}) {
  const styles = useGroupedStyles();
  const { palette } = useTheme();
  const { isNew } = useDesign();
  const rows = collapsed ? [] : React.Children.toArray(children).filter(Boolean);
  const shownFooter = collapsed ? collapsedFooter : footer;
  if (isNew) {
    return (
      <View
        style={[v2.section, divider && { borderBottomWidth: layoutV2.hairline, borderBottomColor: palette.separator }, style]}
        testID={header ? `section-${header}` : undefined}
      >
        {header ? (
          <SectionHeader title={header} right={headerRight} collapsed={collapsed} onToggle={onToggleCollapsed} />
        ) : null}
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Separator inset={separatorInset ?? GROUP_ROW_INSET_V2} /> : null}
            {row}
          </React.Fragment>
        ))}
        {shownFooter ? (
          typeof shownFooter === 'string' ? (
            <SectionFooter tone={collapsed ? 'default' : footerTone}>{shownFooter}</SectionFooter>
          ) : (
            shownFooter
          )
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.section, style]}>
      {header ? (
        <SectionHeader
          title={header}
          right={headerRight}
          collapsed={collapsed}
          onToggle={onToggleCollapsed}
        />
      ) : null}
      {rows.length > 0 ? (
        <View style={styles.card}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          {rows.map((row, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <Separator inset={separatorInset ?? GROUP_ROW_INSET} /> : null}
              {row}
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {shownFooter ? (
        typeof shownFooter === 'string' ? (
          <SectionFooter tone={collapsed ? 'default' : footerTone}>{shownFooter}</SectionFooter>
        ) : (
          shownFooter
        )
      ) : null}
    </View>
  );
}

export function Separator({ inset = GROUP_ROW_INSET }: { inset?: number }) {
  const styles = useGroupedStyles();
  const { palette } = useTheme();
  const { isNew } = useDesign();
  if (isNew) {
    return <View style={{ marginLeft: inset, height: layoutV2.hairline, backgroundColor: palette.separator }} />;
  }
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
  /** `link`: a link-coloured action ("Show all"); in the classic design, as `accent`. */
  tone?: 'default' | 'accent' | 'link' | 'destructive' | 'muted';
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  titleLines?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
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
  testID,
}: GroupedRowProps) {
  const { theme } = useTheme();
  const { isNew } = useDesign();
  const styles = useGroupedStyles();
  const interactive = !!(onPress || onLongPress) && !disabled;

  if (isNew) {
    return (
      <GroupedRowV2
        {...{ title, subtitle, value, icon, iconColor, leading, trailing, accessory, tone, onPress, onLongPress }}
        {...{ disabled, accessibilityLabel, accessibilityHint, titleLines, style, testID }}
      />
    );
  }

  const titleColor =
    tone === 'destructive'
      ? theme.error
      : tone === 'accent' || tone === 'link'
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
        testID={testID}
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
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

/**
 * The new design's row: a 24pt outline glyph in ink (red when destructive),
 * the label in 15pt, a second line in 13pt, the value in grey, a chevron.
 * Actions read in ink; `link` rows in the accent's link colour.
 */
function GroupedRowV2({
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
  testID,
}: GroupedRowProps) {
  const { palette } = useTheme();
  const interactive = !!(onPress || onLongPress) && !disabled;
  const titleColor =
    tone === 'destructive'
      ? palette.red
      : tone === 'link'
        ? palette.link
        : tone === 'muted'
          ? palette.secondary
          : palette.text;

  const content = (
    <>
      {icon ? (
        <Ionicons name={icon} size={24} color={iconColor ?? (tone === 'destructive' ? palette.red : titleColor)} />
      ) : null}
      {leading}
      <View style={v2.rowText}>
        <Text style={[typeV2.body, { color: titleColor }]} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typeV2.meta, v2.subtitle, { color: palette.secondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[typeV2.body, v2.value, { color: palette.secondary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {accessory === 'chevron' ? <Ionicons name="chevron-forward" size={16} color={palette.secondary} /> : null}
      {accessory === 'check' ? <Ionicons name="checkmark" size={20} color={palette.text} /> : null}
    </>
  );

  const rowStyle = [v2.row, disabled && v2.disabled, style];
  if (!onPress && !onLongPress) {
    return (
      <View style={rowStyle} accessibilityLabel={accessibilityLabel} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Tap
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!interactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !interactive }}
      style={rowStyle}
      testID={testID}
    >
      {content}
    </Tap>
  );
}

const v2 = StyleSheet.create({
  section: { paddingTop: 8, paddingBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  headerToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bold: { fontWeight: '600' },
  footer: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    gap: 16,
  },
  rowText: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 2 },
  value: { maxWidth: '50%', textAlign: 'right' },
  disabled: { opacity: 0.4 },
});

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
    headerToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
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
