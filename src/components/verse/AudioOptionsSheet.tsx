import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getSurahDisplay } from '../../lib/quranData';
import {
  clampTo,
  compareVerses,
  PAUSES,
  pauseLabel,
  PLAY_UP_TO,
  PLAY_UP_TO_LABELS,
  PlaybackOptions,
  PlayUpTo,
  rangeEnd,
  REPEATS,
  repeatLabel,
  SPEEDS,
  speedLabel,
  VerseRange,
} from '../../lib/playbackPlan';
import { resolveVoice, shortVoiceLabel } from '../../lib/recitation';
import type { VerseKey } from '../../lib/verses';
import { layoutV2 } from '../../theme/v2';
import { GroupedRow, GroupedSection, Separator } from '../plan/Grouped';
import { InlineStepper } from '../plan/InlineStepper';
import { PillTabs } from '../v2/PillTabs';
import { Sheet } from '../v2/Sheet';
import { WheelItem, WheelPicker } from '../v2/WheelPicker';
import { ReciterList } from './ReciterList';

/** Slowest first, for the stepper's − and +. */
const SPEEDS_UP = [...SPEEDS].sort((a, b) => a - b);

export const verseLabel = (v: VerseKey) => `${getSurahDisplay(v.sura)?.nameDisplay ?? `Surah ${v.sura}`} ${v.sura}:${v.ayah}`;

const SURAHS: WheelItem[] = Array.from({ length: 114 }, (_, i) => {
  const s = getSurahDisplay(i + 1);
  return { key: String(i + 1), label: `${i + 1} · ${s?.nameDisplay ?? ''}`, arabic: s?.nameArabicVoweled };
});

const ayahCount = (sura: number) => getSurahDisplay(sura)?.ayahCount ?? 1;

/** Two wheels, surah and ayah, starting no earlier than `min`. */
function VersePicker({
  value,
  onChange,
  min,
  testID,
}: {
  value: VerseKey;
  onChange: (v: VerseKey) => void;
  min?: VerseKey;
  testID: string;
}) {
  const firstSura = min?.sura ?? 1;
  const surahs = useMemo(() => SURAHS.slice(firstSura - 1), [firstSura]);
  const firstAyah = min && value.sura === min.sura ? min.ayah : 1;
  const ayahs = useMemo<WheelItem[]>(
    () =>
      Array.from({ length: ayahCount(value.sura) - firstAyah + 1 }, (_, i) => ({
        key: String(firstAyah + i),
        label: `Ayah ${firstAyah + i}`,
      })),
    [value.sura, firstAyah],
  );
  return (
    <View style={styles.wheels} testID={testID}>
      <WheelPicker
        items={surahs}
        index={value.sura - firstSura}
        onChange={(i) => {
          const sura = firstSura + i;
          // Same ayah where the surah has it; never before `min`.
          const ayah = Math.min(value.ayah, ayahCount(sura));
          onChange(min ? clampTo(min, { sura, ayah }) : { sura, ayah });
        }}
        label="Surah"
        testID={`${testID}-surah`}
      />
      <WheelPicker
        items={ayahs}
        index={value.ayah - firstAyah}
        onChange={(i) => onChange({ sura: value.sura, ayah: firstAyah + i })}
        label="Ayah"
        testID={`${testID}-ayah`}
      />
    </View>
  );
}

const REPEAT_ITEMS: WheelItem[] = REPEATS.map((r) => ({ key: String(r), label: r === Infinity ? 'Loop ∞' : repeatLabel(r) }));

/**
 * Audio Options: the reciter, the speed, which ayahs to play (From, To, and
 * "Play up to" for where To lands), and how each verse plays (repeats and a
 * pause after it). ▶ plays with these settings. Speed, repeats, the pause
 * and Play up to are kept for the account; From starts at the verse playing
 * or on screen.
 */
export function AudioOptionsSheet({
  visible,
  onClose,
  start,
  options,
  onChangeOptions,
  reciter,
  onChangeReciter,
  onPlay,
}: {
  visible: boolean;
  onClose: () => void;
  /** Where From starts: the verse playing, or the first on the page. */
  start: VerseKey;
  options: PlaybackOptions;
  onChangeOptions: (patch: Partial<PlaybackOptions>) => void;
  reciter: string | null | undefined;
  onChangeReciter: (choice: string) => void;
  onPlay: (range: VerseRange) => void;
}) {
  const { palette } = useTheme();
  const [view, setView] = useState<'options' | 'reciter'>('options');
  const [from, setFrom] = useState<VerseKey>(start);
  const [to, setTo] = useState<VerseKey>(() => rangeEnd(start, options.playUpTo));
  const [open, setOpen] = useState<'from' | 'to' | 'repeat' | null>(null);

  // Each time it opens: From at the verse given, To where Play up to puts it.
  useEffect(() => {
    if (!visible) return;
    setView('options');
    setOpen(null);
    setFrom(start);
    setTo(rangeEnd(start, options.playUpTo === 'custom' ? 'surah' : options.playUpTo));
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const changeFrom = (v: VerseKey) => {
    setFrom(v);
    setTo((t) => (options.playUpTo === 'custom' ? clampTo(v, t) : rangeEnd(v, options.playUpTo)));
  };
  const changeTo = (v: VerseKey) => {
    setTo(clampTo(from, v));
    // Choosing To yourself is Custom.
    if (options.playUpTo !== 'custom') onChangeOptions({ playUpTo: 'custom' });
  };
  const changeUpTo = (upTo: PlayUpTo) => {
    onChangeOptions({ playUpTo: upTo });
    if (upTo !== 'custom') setTo(rangeEnd(from, upTo));
  };
  const toggle = (which: 'from' | 'to' | 'repeat') => setOpen((o) => (o === which ? null : which));

  const speedIndex = Math.max(0, SPEEDS_UP.indexOf(options.speed as (typeof SPEEDS_UP)[number]));

  const optionsView = (
    <View>
      <GroupedSection>
        <GroupedRow
          title="Reciter"
          value={shortVoiceLabel(resolveVoice(reciter))}
          accessory="chevron"
          onPress={() => setView('reciter')}
          testID="audio-reciter"
        />
        <Separator />
        <GroupedRow
          title="Playback speed"
          trailing={
            <InlineStepper
              value={speedIndex}
              min={0}
              max={SPEEDS_UP.length - 1}
              onChange={(i) => onChangeOptions({ speed: SPEEDS_UP[i] })}
              label="playback speed"
              formatValue={(i) => speedLabel(SPEEDS_UP[i])}
            />
          }
          testID="audio-speed"
        />
      </GroupedSection>

      <GroupedSection
        header="Ayahs to play"
        footer="Page, Surah and Juz’ set To for you, and are kept for next time. Choose To yourself and it’s Custom."
      >
        <GroupedRow
          title="From"
          value={verseLabel(from)}
          accessory="chevron"
          onPress={() => toggle('from')}
          accessibilityHint="Shows a picker"
          testID="audio-from"
        />
        {open === 'from' ? <VersePicker value={from} onChange={changeFrom} testID="audio-from-picker" /> : null}
        <Separator />
        <GroupedRow
          title="To"
          value={verseLabel(to)}
          accessory="chevron"
          onPress={() => toggle('to')}
          accessibilityHint="Shows a picker"
          testID="audio-to"
        />
        {open === 'to' ? <VersePicker value={to} min={from} onChange={changeTo} testID="audio-to-picker" /> : null}
        <Separator />
        <View style={styles.block}>
          <GroupedRow title="Play up to" style={styles.flatRow} />
          <PillTabs
            options={PLAY_UP_TO.map((u) => ({ value: u, label: PLAY_UP_TO_LABELS[u] }))}
            value={options.playUpTo}
            onChange={changeUpTo}
            testID="audio-up-to"
          />
        </View>
      </GroupedSection>

      <GroupedSection
        header="Each verse"
        footer="A pause about as long as the verse (1×) leaves time to recite it back from memory before the next one."
        divider={false}
      >
        <GroupedRow
          title="Repeat"
          value={repeatLabel(options.repeat)}
          accessory="chevron"
          onPress={() => toggle('repeat')}
          accessibilityHint="Shows a picker"
          testID="audio-repeat"
        />
        {open === 'repeat' ? (
          <View style={styles.wheels}>
            <WheelPicker
              items={REPEAT_ITEMS}
              index={REPEATS.indexOf(options.repeat as (typeof REPEATS)[number])}
              onChange={(i) => onChangeOptions({ repeat: REPEATS[i] })}
              label="Repeat"
              testID="audio-repeat-picker"
            />
          </View>
        ) : null}
        <Separator />
        <View style={styles.block}>
          <GroupedRow title="Pause after each verse" style={styles.flatRow} />
          <PillTabs
            options={PAUSES.map((p) => ({ value: String(p), label: pauseLabel(p) }))}
            value={String(options.pauseFactor)}
            onChange={(p) => onChangeOptions({ pauseFactor: Number(p) })}
            testID="audio-pause"
          />
        </View>
      </GroupedSection>
    </View>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={view === 'options' ? 'Audio Options' : 'Reciter'}
      left={
        view === 'options'
          ? { label: 'Close', icon: 'close', onPress: onClose, testID: 'audio-close' }
          : { label: 'Back', icon: 'chevron-back', onPress: () => setView('options'), testID: 'audio-back' }
      }
      right={
        view === 'options'
          ? {
              label: 'Play with these settings',
              icon: 'play',
              round: true,
              onPress: () => onPlay({ from, to: compareVerses(to, from) < 0 ? from : to }),
              testID: 'audio-play',
            }
          : undefined
      }
      scroll
      testID="audio-options"
    >
      {view === 'options' ? (
        optionsView
      ) : (
        <View style={[styles.reciters, { borderTopColor: palette.separator }]}>
          <ReciterList
            value={reciter ?? undefined}
            onChange={(choice) => {
              onChangeReciter(choice);
              setView('options');
            }}
            maxHeight={460}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', paddingHorizontal: layoutV2.gutter, paddingBottom: 8 },
  block: { paddingBottom: 12 },
  flatRow: { minHeight: 44 },
  reciters: { paddingTop: 4 },
});
