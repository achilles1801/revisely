// Add to chat's Days: a month as Activity's Overview draws it (mock d3; the cells are the same as
// activity/CalendarMonth's in PR #329), then the picked day's preview and "Add day". A day added
// gets a check on its cell. Tapping through days only previews them; nothing goes until Add day.

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { monthGrid, monthTitle, shiftMonth } from '../../lib/activityHeatmap';
import { dayFacts, type DayExtras, type Prepared } from '../../lib/revo/facts';
import type { RevoDayFacts } from '../../lib/revo/types';
import { typeV2 } from '../../theme/v2';
import { BlockMark, RevisedMark } from '../activity/BlockMark';
import { Tap } from '../v2/Tap';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DISC = 34;

/** How much of the day's plan was done, as Activity's ring shows it: none for a day nothing was revised on. */
export function ringOf(f: RevoDayFacts): number | null {
  if (!f.plan) return null;
  const done = f.plan.pages - f.plan.notDone;
  return done > 0 ? done / f.plan.pages : null;
}

/** "Tuesday 27 October": the mock's order, no comma. */
function longDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })}`;
}

export function RevoMonth({
  prepared,
  extras,
  today,
  chosen,
  canAdd,
  onToggle,
}: {
  prepared: Prepared;
  extras: DayExtras | null;
  today: string;
  /** The days already chosen (each gets a check). */
  chosen: ReadonlySet<string>;
  /** Room for one more. */
  canAdd: boolean;
  onToggle: (day: string) => void;
}) {
  const { palette } = useTheme();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState(today);
  const grid = useMemo(() => monthGrid(month), [month]);
  // Each day's facts, worked out once a month and day (the extras arrive a moment later).
  const facts = useMemo(() => {
    const out = new Map<string, RevoDayFacts>();
    for (const d of grid.flat()) if (d && d <= today) out.set(d, dayFacts(d, prepared, extras ?? {}));
    if (!out.has(picked) && picked <= today) out.set(picked, dayFacts(picked, prepared, extras ?? {}));
    return out;
  }, [grid, prepared, extras, today, picked]);

  const f = facts.get(picked) ?? null;
  const isChosen = chosen.has(picked);
  const rows: { key: string; mark: React.ReactNode; label: string; value: string; mics?: number }[] = [];
  if (f) {
    const ring = ringOf(f);
    const minutes = f.minutes ? ` · ${f.minutes} min` : '';
    const revised = f.plan ? `${f.plan.pages - f.plan.notDone} of ${f.plan.pages}${minutes}` : f.revised.pages > 0 ? `${f.revised.pages} pages${minutes}` : 'Nothing revised';
    rows.push({ key: 'revised', mark: <RevisedMark fraction={ring ?? 0} done={(ring ?? 0) >= 1} size={26} />, label: 'Revised', value: revised, mics: f.recordings?.count || undefined });
    if (f.revised.name) rows.push({ key: 'passages', mark: <IconDot icon="layers-outline" />, label: 'Passages', value: f.revised.name });
    const r = f.ratings;
    const rated = [r.weak ? `${r.weak} weak` : '', r.moderate ? `${r.moderate} moderate` : '', r.strong ? `${r.strong} strong` : ''].filter(Boolean);
    if (rated.length) rows.push({ key: 'ratings', mark: <IconDot icon="pulse-outline" />, label: 'Ratings', value: rated.join(' · ') });
    if (f.memorized.pages > 0) rows.push({ key: 'memorized', mark: <BlockMark kind="memorized" size={26} />, label: 'Memorized', value: `+${f.memorized.pages} ${f.memorized.pages === 1 ? 'page' : 'pages'}` });
    if (f.readMinutes) rows.push({ key: 'read', mark: <BlockMark kind="read" size={26} />, label: 'Read', value: `${f.readMinutes} min` });
    if (f.notes?.length) rows.push({ key: 'notes', mark: <BlockMark kind="notes" size={26} />, label: 'Notes', value: `${f.notes.length}, sent with the day` });
  }

  return (
    <View testID="revo-add-month">
      <View style={styles.head}>
        <Text style={[styles.title, { color: palette.text }]}>{monthTitle(month)}</Text>
        <View style={styles.chevrons}>
          <Tap onPress={() => setMonth((m) => shiftMonth(m, -1))} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} testID="revo-add-month-prev">
            <Ionicons name="chevron-back" size={21} color={palette.text} />
          </Tap>
          <Tap
            onPress={() => setMonth((m) => (m < today.slice(0, 7) ? shiftMonth(m, 1) : m))}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            hitSlop={8}
            testID="revo-add-month-next"
          >
            <Ionicons name="chevron-forward" size={21} color={month < today.slice(0, 7) ? palette.text : palette.separator} />
          </Tap>
        </View>
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[styles.letter, { color: palette.secondary }]}>
            {w}
          </Text>
        ))}
      </View>
      {grid.map((week, r) => (
        <View key={r} style={styles.row}>
          {week.map((d, c) =>
            d ? (
              <DayCell key={c} day={d} today={today} facts={facts.get(d) ?? null} picked={picked === d} chosen={chosen.has(d)} onPress={() => setPicked(d)} />
            ) : (
              <View key={c} style={styles.cell} />
            ),
          )}
        </View>
      ))}

      <View style={[styles.rule, { backgroundColor: palette.separator }]} />
      <View style={styles.previewHead}>
        <Text style={[styles.previewDate, { color: palette.text }]} numberOfLines={1}>
          {longDay(picked)}
        </Text>
        {picked <= today ? (
          <Tap
            onPress={() => onToggle(picked)}
            disabled={!isChosen && !canAdd}
            accessibilityRole="button"
            accessibilityLabel={isChosen ? 'Remove this day' : 'Add this day'}
            accessibilityState={{ selected: isChosen, disabled: !isChosen && !canAdd }}
            style={[
              styles.addDay,
              isChosen ? { borderWidth: 1, borderColor: palette.outline } : { backgroundColor: palette.primary },
              !isChosen && !canAdd && { opacity: 0.45 },
            ]}
            testID="revo-add-day"
          >
            <Ionicons name={isChosen ? 'checkmark' : 'add'} size={17} color={isChosen ? palette.text : palette.onPrimary} />
            <Text style={[typeV2.button, { color: isChosen ? palette.text : palette.onPrimary }]}>{isChosen ? 'Added' : 'Add day'}</Text>
          </Tap>
        ) : null}
      </View>
      {rows.map((r) => (
        <View key={r.key} style={styles.previewRow} testID={`revo-add-preview-${r.key}`}>
          {r.mark}
          <Text style={[typeV2.body, styles.previewLabel, { color: palette.text }]}>{r.label}</Text>
          <Text style={[typeV2.body, styles.previewValue, { color: palette.text }]} numberOfLines={1}>
            {r.value}
          </Text>
          {r.mics ? (
            <View style={styles.mics} accessible accessibilityLabel={`${r.mics} ${r.mics === 1 ? 'recording' : 'recordings'}`}>
              <Ionicons name="mic-outline" size={13} color={palette.secondary} />
              <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>{r.mics}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function IconDot({ icon }: { icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.iconDot, { backgroundColor: palette.bubble }]}>
      <Ionicons name={icon} size={13} color={palette.text} />
    </View>
  );
}

/** A day: the disc (a ring for part done, solid for done), its number, the dots, and a check when added. */
function DayCell({ day, today, facts, picked, chosen, onPress }: { day: string; today: string; facts: RevoDayFacts | null; picked: boolean; chosen: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  const ring = facts ? ringOf(facts) : null;
  const done = ring != null && ring >= 1;
  const future = day > today;
  const r = (DISC - 2.5) / 2;
  const c = 2 * Math.PI * r;
  const numberColor = done ? palette.onPrimary : day === today ? palette.accentText : ring != null ? palette.text : palette.secondary;
  return (
    <Tap
      onPress={onPress}
      disabled={future}
      accessibilityRole="button"
      accessibilityLabel={`${longDay(day)}${ring != null ? `, revised ${Math.round(ring * 100)} percent` : ''}${chosen ? ', added' : ''}`}
      accessibilityState={{ selected: picked, disabled: future }}
      style={[styles.cell, picked && { backgroundColor: palette.accentSubtle }]}
      testID={`revo-add-day-${day}`}
    >
      <View style={styles.disc}>
        {ring != null && !done ? (
          <Svg width={DISC} height={DISC} style={StyleSheet.absoluteFill}>
            <Circle cx={DISC / 2} cy={DISC / 2} r={r} stroke={palette.track} strokeWidth={2.5} fill="none" />
            <Circle
              cx={DISC / 2}
              cy={DISC / 2}
              r={r}
              stroke={palette.primary}
              strokeWidth={2.5}
              fill="none"
              strokeDasharray={`${c * ring} ${c}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${DISC / 2} ${DISC / 2})`}
            />
          </Svg>
        ) : null}
        {done ? <View style={[StyleSheet.absoluteFill, { borderRadius: DISC / 2, backgroundColor: palette.primary }]} /> : null}
        <Text style={[styles.number, { color: numberColor, fontWeight: done || ring != null ? '600' : '400', opacity: future ? 0.5 : 1 }]}>{Number(day.slice(8))}</Text>
        {chosen ? (
          <View style={[styles.badge, { backgroundColor: palette.primary, borderColor: palette.sheet }]} testID={`revo-add-day-added-${day}`}>
            <Ionicons name="checkmark" size={11} color={palette.onPrimary} />
          </View>
        ) : null}
      </View>
      <View style={styles.dots}>
        <View style={[styles.slot, facts && facts.memorized.pages > 0 && { backgroundColor: palette.primary, borderRadius: 2.5 }]} />
        <View style={[styles.slot, facts && (facts.readMinutes ?? 0) > 0 && { backgroundColor: palette.text, borderRadius: 2.5 }]} />
        <View style={[styles.slot, facts && (facts.notes?.length ?? 0) > 0 && [styles.noteRing, { borderColor: palette.secondary }]]} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  head: { height: 36, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, lineHeight: 22, fontWeight: '600' },
  chevrons: { flexDirection: 'row', gap: 22 },
  row: { flexDirection: 'row', gap: 4, marginTop: 2 },
  letter: { flex: 1, height: 18, lineHeight: 18, fontSize: 13, textAlign: 'center' },
  cell: { flex: 1, height: 50, borderRadius: 12, paddingTop: 4, alignItems: 'center' },
  disc: { width: DISC, height: DISC, alignItems: 'center', justifyContent: 'center', borderRadius: DISC / 2 },
  number: { fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] },
  badge: { position: 'absolute', right: -5, top: -5, width: 17, height: 17, borderRadius: 8.5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 4, height: 5, alignItems: 'center' },
  slot: { width: 5, height: 5 },
  noteRing: { borderRadius: 2.5, borderWidth: 1.2, backgroundColor: 'transparent' },
  rule: { height: StyleSheet.hairlineWidth, marginTop: 8 },
  previewHead: { minHeight: 44, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewDate: { flex: 1, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  addDay: { height: 32, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewRow: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewLabel: { width: 84 },
  previewValue: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  mics: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -2 },
  iconDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
