import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { PillTabs } from '../v2/PillTabs';
import { Tap } from '../v2/Tap';
import { SettingSwitch } from '../settings/SettingSwitch';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';
import { getSurahDisplay } from '../../lib/quranData';
import { getQuranWords, loadQuranWords, QuranWords } from '../../lib/recite/quranWords';
import { verseEndMark } from '../../lib/verseShare';
import type { VerseKey } from '../../lib/verses';
import { CheckResult, describeTajweed, describeWord, summary } from '../../lib/reciteCheck/result';
import {
  checkRecitation,
  CheckError,
  FAILURE_TEXT,
  warmUpReciteCheck,
} from '../../lib/reciteCheck/service';
import {
  ReciteCheckSettings,
  setReciteCheckSettings,
  useReciteCheckSettings,
} from '../../lib/reciteCheck/settings';
import { chunkSeconds, encodeWav } from '../../lib/reciteCheck/wav';
import { ReciteCheckNotice } from './ReciteCheckNotice';
import { useReciteRecorder } from './useReciteRecorder';

type Step = 'notice' | 'about' | 'ready' | 'checking' | 'result' | 'error';

interface Props {
  visible: boolean;
  /** The ayah the recitation starts from (the held verse). */
  from: VerseKey | null;
  accountId: string | null | undefined;
  onClose: () => void;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const surahName = (sura: number) => getSurahDisplay(sura)?.nameDisplay ?? `Surah ${sura}`;

/**
 * Check my recitation (Revisely Dev, testers): recite from the held verse, stop, and the lab's checker on
 * revisely-dev says which words were skipped, said wrong or added, and which tajweed rules it didn't hear
 * (scripts/recite-check). The AI notice comes before the first check.
 */
export function ReciteCheckSheet({ visible, from, accountId, onClose }: Props) {
  const { palette } = useTheme();
  const settings = useReciteCheckSettings(accountId);
  const [view, setView] = useState<Step>('ready');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [failure, setFailure] = useState('');
  const [slow, setSlow] = useState(false);
  const [words, setWords] = useState<QuranWords | null>(getQuranWords());
  const shown = useRef(from);
  if (visible && from) shown.current = from;
  const start = shown.current;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const onRecorded = useCallback(async (chunks: Int16Array[]) => {
    const at = shown.current;
    if (!at) return;
    if (chunkSeconds(chunks) < 1) {
      setFailure(FAILURE_TEXT.too_short);
      setView('error');
      return;
    }
    setView('checking');
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 6000);
    try {
      const [r, qw] = await Promise.all([
        checkRecitation(encodeWav(chunks), at, null, settingsRef.current),
        loadQuranWords().catch(() => null),
      ]);
      setWords(qw ?? getQuranWords());
      setResult(r);
      setView('result');
    } catch (err) {
      setFailure(FAILURE_TEXT[err instanceof CheckError ? err.reason : 'server']);
      setView('error');
    } finally {
      clearTimeout(timer);
    }
  }, []);
  const recorder = useReciteRecorder(onRecorded);
  const cancelRecording = recorder.cancel;

  useEffect(() => {
    if (visible) {
      setView(settingsRef.current.noticeSeen ? 'ready' : 'notice');
      setResult(null);
      warmUpReciteCheck();
    } else {
      cancelRecording();
    }
  }, [visible, cancelRecording]);

  const set = (update: Partial<ReciteCheckSettings>) => setReciteCheckSettings(accountId, update);
  const recording = recorder.status === 'recording' || recorder.status === 'starting';
  const place = start ? `${surahName(start.sura)} ${start.sura}:${start.ayah}` : '';

  let body: React.ReactNode;
  if (view === 'notice' || view === 'about') {
    body = (
      <View style={styles.block}>
        <ReciteCheckNotice />
        <View style={styles.pad}>
          {view === 'notice' ? (
            <PillButton
              title="I understand"
              size="lg"
              onPress={() => {
                set({ noticeSeen: true });
                setView('ready');
              }}
              testID="recite-check-agree"
            />
          ) : (
            <PillButton title="Back" size="lg" variant="outline" onPress={() => setView('ready')} />
          )}
        </View>
      </View>
    );
  } else if (view === 'checking') {
    body = (
      <View style={[styles.center, styles.pad]} testID="recite-check-checking">
        <ActivityIndicator color={palette.secondary} />
        <Text style={[typeV2.body, { color: palette.secondary }]}>{slow ? 'Waking the checker…' : 'Checking…'}</Text>
      </View>
    );
  } else if (view === 'error') {
    body = (
      <View style={[styles.block, styles.pad]}>
        <Text style={[typeV2.body, { color: palette.text }]} testID="recite-check-error">
          {failure}
        </Text>
        <PillButton title="Try again" size="lg" onPress={() => setView('ready')} />
      </View>
    );
  } else if (view === 'result' && result) {
    body = <ResultView result={result} words={words} onAgain={() => setView('ready')} onDone={onClose} />;
  } else if (recording) {
    body = (
      <View style={[styles.center, styles.pad]} testID="recite-check-recording">
        <Text style={[styles.clock, typeV2.numeral, { color: palette.text }]}>{clock(recorder.seconds)}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>Listening from {place}</Text>
        <PillButton
          title="Stop and check"
          size="lg"
          icon="stop"
          onPress={recorder.stop}
          disabled={recorder.status !== 'recording'}
          testID="recite-check-stop"
        />
        <PillButton title="Cancel" size="lg" variant="outline" onPress={recorder.cancel} />
      </View>
    );
  } else {
    body = (
      <View style={styles.block}>
        <Text style={[typeV2.body, styles.pad, { color: palette.secondary }]}>
          From {place}. Recite as far as you like, then tap Stop. At most 4 minutes.
        </Text>
        <View style={styles.pad}>
          <PillButton
            title="Start reciting"
            size="lg"
            icon="mic"
            onPress={recorder.start}
            testID="recite-check-start"
          />
        </View>
        {recorder.status === 'denied' ? (
          <Tap onPress={() => Linking.openSettings()} style={styles.pad}>
            <Text style={[typeV2.meta, { color: palette.red }]}>
              Revisely needs the microphone to check your recitation. Allow it in Settings ›
            </Text>
          </Tap>
        ) : recorder.status === 'error' ? (
          <Text style={[typeV2.meta, styles.pad, { color: palette.red }]}>Couldn’t start the microphone.</Text>
        ) : null}
        <SettingsBlock settings={settings} onChange={set} />
        <Tap onPress={() => setView('about')} style={styles.pad} testID="recite-check-about">
          <Text style={[typeV2.meta, { color: palette.link }]}>About this check ›</Text>
        </Tap>
      </View>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Check my recitation" scroll testID="recite-check-sheet">
      {body}
    </Sheet>
  );
}

function SettingsBlock({
  settings,
  onChange,
}: {
  settings: ReciteCheckSettings;
  onChange: (u: Partial<ReciteCheckSettings>) => void;
}) {
  const { palette } = useTheme();
  const row = (label: string, control: React.ReactNode, sub?: string) => (
    <View style={[styles.row, { borderTopColor: palette.separator }]}>
      <View style={styles.rowText}>
        <Text style={[typeV2.body, { color: palette.text }]}>{label}</Text>
        {sub ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{sub}</Text> : null}
      </View>
      {control}
    </View>
  );
  return (
    <View>
      {row(
        'Madd munfasil',
        <PillTabs
          compact
          hug
          tone="ink"
          options={[2, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
          value={String(settings.munfasil)}
          onChange={(v) => onChange({ munfasil: Number(v) as 2 | 4 | 5 })}
        />,
      )}
      {row(
        'Madd muttasil',
        <PillTabs
          compact
          hug
          tone="ink"
          options={[4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          value={String(settings.muttasil)}
          onChange={(v) => onChange({ muttasil: Number(v) as 4 | 5 | 6 })}
        />,
      )}
      {row(
        'Madd ʿarid',
        <PillTabs
          compact
          hug
          tone="ink"
          options={[
            { value: '0', label: 'Any' },
            ...[2, 4, 6].map((n) => ({ value: String(n), label: String(n) })),
          ]}
          value={String(settings.aared)}
          onChange={(v) => onChange({ aared: Number(v) as 0 | 2 | 4 | 6 })}
        />,
        'At a stop',
      )}
      {row(
        'Letters and harakat',
        <SettingSwitch
          value={settings.letters}
          onValueChange={(letters) => onChange({ letters })}
          accessibilityLabel="Letters and harakat"
          testID="recite-check-letters"
        />,
        'Experimental: it flags many correct words',
      )}
      {row(
        'Keep as test data',
        <SettingSwitch
          value={settings.keep}
          onValueChange={(keep) => onChange({ keep })}
          accessibilityLabel="Keep my recitations as test data"
          testID="recite-check-keep"
        />,
        'For Revisely’s tests. Software checks it; nobody listens.',
      )}
    </View>
  );
}

interface Finding {
  w: number;
  text: string;
  tone: 'word' | 'tajweed';
}

function ResultView({
  result,
  words,
  onAgain,
  onDone,
}: {
  result: CheckResult;
  words: QuranWords | null;
  onAgain: () => void;
  onDone: () => void;
}) {
  const { palette } = useTheme();
  const { spans, findings } = useMemo(() => {
    const status = new Map(result.words.map((w) => [w.w, w]));
    const tajweedAt = new Set(result.tajweed.map((n) => n.w));
    const lettersAt = new Set((result.letters ?? []).map((l) => l.w));
    const ws = result.words.map((w) => w.w);
    const lo = ws.length ? Math.min(...ws) : result.from;
    const hi = ws.length ? Math.max(...ws) : result.from - 1;
    const out: { w: number; text: string; color: string; underline: boolean; end?: string }[] = [];
    for (let w = lo; w <= hi && words; w++) {
      const st = status.get(w)?.status;
      const bad = st === 'wrong' || st === 'missed' || lettersAt.has(w);
      const next = w + 1 <= hi ? words.ref(w + 1) : null;
      const ref = words.ref(w);
      out.push({
        w,
        text: words.uthmani(w),
        color: bad ? palette.red : tajweedAt.has(w) ? palette.accentText : palette.text,
        underline: bad || tajweedAt.has(w),
        end: !next || next.ayah !== ref.ayah || next.sura !== ref.sura ? verseEndMark(ref.ayah) : undefined,
      });
    }
    const f: Finding[] = [];
    for (const w of result.words) {
      const d = describeWord(w);
      if (d) f.push({ w: w.w, text: d, tone: 'word' });
    }
    for (const l of result.letters ?? []) f.push({ w: l.w, text: `Letters · ${l.slip}`, tone: 'word' });
    for (const e of result.extras) {
      f.push({ w: e.after, text: e.trail ? 'Something said after the last word' : 'Extra words after this', tone: 'word' });
    }
    for (const n of result.tajweed) f.push({ w: n.w, text: describeTajweed(n), tone: 'tajweed' });
    f.sort((a, b) => a.w - b.w);
    return { spans: out, findings: f };
  }, [result, words, palette]);

  return (
    <View style={styles.block} testID="recite-check-result">
      <View style={styles.pad}>
        <Text style={[typeV2.name, { color: palette.text }]} testID="recite-check-summary">
          {summary(result)}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>
          {clock(result.secs)} checked{result.kept ? ' · kept as test data' : ''}
        </Text>
      </View>
      {spans.length ? (
        <Text style={[arabicV2(22), styles.ar, styles.pad]} testID="recite-check-passage">
          {spans.map((s) => (
            <Text
              key={s.w}
              style={[{ color: s.color }, s.underline ? styles.underline : null]}
            >
              {s.text}
              {s.end ? <Text style={{ color: palette.secondary }}>{` ${s.end}`}</Text> : null}{' '}
            </Text>
          ))}
        </Text>
      ) : null}
      {findings.map((f, i) => {
        const ref = words?.ref(f.w);
        return (
          <View key={`${f.w}-${i}`} style={[styles.row, { borderTopColor: palette.separator }]}>
            <View style={styles.rowText}>
              <Text style={[typeV2.body, { color: f.tone === 'word' ? palette.red : palette.accentText }]}>{f.text}</Text>
              {ref ? (
                <Text style={[typeV2.meta, { color: palette.secondary }]}>
                  {surahName(ref.sura)} {ref.sura}:{ref.ayah}
                </Text>
              ) : null}
            </View>
            {words ? <Text style={[arabicV2(20), { color: palette.text }]}>{words.uthmani(f.w)}</Text> : null}
          </View>
        );
      })}
      <View style={[styles.pad, styles.buttons]}>
        <PillButton title="Check again" size="lg" onPress={onAgain} testID="recite-check-again" />
        <PillButton title="Done" size="lg" variant="outline" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12, paddingBottom: 16 },
  pad: { paddingHorizontal: layoutV2.gutter },
  center: { alignItems: 'center', gap: 14, paddingVertical: 24 },
  clock: { fontSize: 44, lineHeight: 52, fontWeight: '300' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  ar: { writingDirection: 'rtl', textAlign: 'right' },
  underline: { textDecorationLine: 'underline' },
  buttons: { gap: 10, marginTop: 8 },
});
