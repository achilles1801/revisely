import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';

/**
 * Grouped list primitives, as in Settings.
 *
 *   <GroupedSection header="Cycle" footer="Tap a day to edit it.">
 *     <GroupedRow title="Today" subtitle="Juz 2 · 10 pages" accessory="chevron" />
 *   </GroupedSection>
 *
 * Sections draw hairline separators between rows automatically. No card:
 * rows flat on the ground with a 16pt gutter and 0.5pt separators, a bold
 * sentence-case header, a 13pt footer, a hairline closing the section. Taps
 * dim instead of buzzing.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Where separators start by default: the gutter. */
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
  const { palette } = useTheme();
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

export function SectionFooter({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'warning';
}) {
  const { palette } = useTheme();
  // A warning is advice, not an error (red is for errors and deleting):
  // full ink, so it stands out from the grey footers.
  return (
    <Text style={[typeV2.meta, v2.footer, { color: tone === 'warning' ? palette.text : palette.secondary }]}>
      {children}
    </Text>
  );
}

/** Small text button for section headers ("Edit" / "Done"): a link, like "See all". */
export function HeaderTextButton({
  label,
  onPress,
  bold = false,
}: {
  label: string;
  onPress: () => void;
  bold?: boolean;
}) {
  const { palette } = useTheme();
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
  /** A hairline closes the section (off for the last one in a sheet). */
  divider?: boolean;
  children: React.ReactNode;
}) {
  const { palette } = useTheme();
  const rows = collapsed ? [] : React.Children.toArray(children).filter(Boolean);
  const shownFooter = collapsed ? collapsedFooter : footer;
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

export function Separator({ inset = GROUP_ROW_INSET_V2 }: { inset?: number }) {
  const { palette } = useTheme();
  return <View style={{ marginLeft: inset, height: layoutV2.hairline, backgroundColor: palette.separator }} />;
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
  /** `link`: a link-coloured action ("Show all"). */
  tone?: 'default' | 'link' | 'destructive' | 'muted';
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  titleLines?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A row: a 24pt outline glyph in ink (red when destructive), the label in
 * 15pt, a second line in 13pt, the value in grey, a chevron. Actions read in
 * ink; `link` rows in the accent's link colour.
 */
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
