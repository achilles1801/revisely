import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { currentLanguage, t } from '../../i18n';
import { backIcon, forwardIcon } from '../../i18n/direction';
import { ayahCount } from '../../lib/ayahKeys';
import { LEARN_STEPS, LEARN_VOICE, learnOptions, meaningOf, surahText, type LearnStep, type Meaning } from '../../lib/beginner/learn';
import { MeaningText } from '../../components/beginner/MeaningText';
import { saveSurahAyahs } from '../../lib/beginner/save';
import { BEGINNER_SURAHS, knownSurahs, nextSurahOnPath, surahChoiceChanges } from '../../lib/beginner/surahs';
import { getRevisionDayForUser } from '../../lib/fajrBoundary';
import { logger } from '../../lib/logger';
import { setPresenting } from '../../lib/nowPlaying';
import { surahNameIn } from '../../lib/passages';
import { getRecitation, resolveVoice, voiceLabel, type RecitationState } from '../../lib/recitation';
import { getSaheehVerse, peekSaheehVerse } from '../../lib/saheeh';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { layoutV2, arabicFullV2, typeV2 } from '../../theme/v2';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'LearnSurah'>;
type Route = RouteProp<HomeStackParamList, 'LearnSurah'>;

/** The recitation this screen starts (lib/recitation's owner), so it reacts only to its own. */
const OWNER = 'learn-surah';
/** The ayah's Arabic: large, reading text (it grows with Dynamic Type and wraps). */
const ARABIC = 28;
const PLAY = 64;

/**
 * Each ayah's meaning (BEGIN-7): Saheeh International's English, in English, every verse (its footnote numbers raised, its
 * footnotes kept), "loading" until its surah is read from the phone or fetched, "offline" when it can't be (not on the
 * phone and no connection), and null in another language (no English shown there).
 */
type MeaningState = Meaning | 'loading' | 'offline' | null;

function useMeanings(sura: number, ayahs: number): MeaningState[] {
  const english = currentLanguage() === 'en';
  const read = useCallback(
    (failed: boolean): MeaningState[] =>
      Array.from({ length: ayahs }, (_, i) => {
        if (!english) return null;
        return meaningOf(peekSaheehVerse(sura, i + 1)) ?? (failed ? 'offline' : 'loading');
      }),
    [english, sura, ayahs],
  );
  const [meanings, setMeanings] = useState(() => read(false));
  useEffect(() => {
    if (!english) return undefined;
    let live = true;
    setMeanings(read(false));
    Promise.all(Array.from({ length: ayahs }, (_, i) => getSaheehVerse(sura, i + 1).then(() => true, () => false)))
      .then((got) => {
        if (live) setMeanings(read(got.some((ok) => !ok)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [english, sura, ayahs, read]);
  return meanings;
}


/**
 * Learn (BEGIN-7, Revisely Dev), from a beginner's Home: a surah one ayah at a time. Listen plays the ayah three times,
 * slowly, in Al-Husary's Mu'allim recitation; Repeat adds a pause after each play to say it back; Without looking hides
 * it until "Show the ayah". Its meaning is under it (Saheeh International, in English). "I can recite it" memorizes the
 * surah by the ayah and logs it on today (BEGIN-8), then Learned names the next surah on the path.
 */
export default function LearnSurahScreen() {
  const navigation = useNavigation<Nav>();
  const { sura } = useRoute<Route>().params;
  const { palette } = useTheme();
  const haptics = useHaptics();
  const { user, pages, updatePages } = useApp();
  const total = ayahCount(sura);
  const name = surahNameIn(sura);

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<LearnStep>('listen');
  const [shown, setShown] = useState(false);
  const [text, setText] = useState<string[] | 'loading' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [learned, setLearned] = useState(false);
  const meanings = useMeanings(sura, total);

  useEffect(() => {
    let live = true;
    setText('loading');
    surahText(sura, total)
      .then((ayahs) => live && setText(ayahs))
      .catch((err) => {
        logger.warn('Learn: the surah’s text did not load', err);
        if (live) setText('failed');
      });
    return () => {
      live = false;
    };
  }, [sura, total, attempt]);

  // The one player: set for Learn while it plays here, and given back as it was (the reader's Audio Options) after.
  const recitation = getRecitation();
  const [playback, setPlayback] = useState<RecitationState>(recitation.getState());
  useEffect(() => recitation.subscribe(setPlayback), [recitation]);
  useEffect(() => {
    const before = { options: recitation.getOptions(), voice: recitation.getVoice() };
    return () => {
      recitation.stop(OWNER);
      recitation.setOptions(before.options);
      recitation.setVoice(before.voice);
      setPresenting(OWNER, false);
    };
  }, [recitation]);
  const mine = playback.owner === OWNER && playback.status !== 'idle';
  const playing = mine && (playback.status === 'playing' || playback.status === 'loading');
  // While it plays here, the mini player steps aside.
  useEffect(() => setPresenting(OWNER, mine), [mine]);

  // Another ayah or step: what was playing stops, and a hidden ayah is hidden again.
  useEffect(() => {
    recitation.stop(OWNER);
    setShown(false);
  }, [index, step, recitation]);

  const onPlay = () => {
    haptics.selection();
    if (playing) {
      recitation.pause();
      return;
    }
    if (mine && playback.status === 'paused') {
      recitation.resume();
      return;
    }
    recitation.setVoice(LEARN_VOICE);
    recitation.setOptions(learnOptions(step));
    // This ayah alone: Learn moves on when they do.
    recitation.play({ sura, ayah: index + 1 }, () => null, OWNER);
  };

  const onRecite = async () => {
    if (saving || !user) return;
    setSaving(true);
    try {
      recitation.stop(OWNER);
      const known = knownSurahs(pages);
      await saveSurahAyahs({ pages, updatePages }, surahChoiceChanges(known, new Set([...known, sura]), false), {
        now: new Date().toISOString(),
        logDay: getRevisionDayForUser(user),
      });
      haptics.success();
      setLearned(true);
    } catch (err) {
      logger.error('Learn: saving the surah failed', err);
      Alert.alert(t('beginner.learn.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (learned) return <Learned sura={sura} onDone={() => navigation.goBack()} onNext={(next) => navigation.replace('LearnSurah', { sura: next })} />;

  const hint = step === 'listen' ? t('beginner.learn.listenHint') : step === 'repeat' ? t('beginner.learn.repeatHint') : t('beginner.learn.recallHint');
  const hidden = step === 'recall' && !shown;
  const current = meanings[index];
  const ayahs = Array.isArray(text) ? text : null;

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title={name} onBack={() => navigation.goBack()} separator />
      <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.content} testID="learn-surah">
        <View style={styles.gutter}>
          <StepChips value={step} onChange={setStep} />
          <Text style={[typeV2.meta, styles.center, styles.hint, { color: palette.secondary }]} maxFontSizeMultiplier={1.6} testID="learn-hint">
            {t('beginner.learn.ayahOf', { n: index + 1, total })}
            {' · '}
            {hint}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: palette.highlight }]} testID="learn-ayah">
          {text === 'loading' ? (
            <ActivityIndicator color={palette.secondary} testID="learn-loading" />
          ) : text === 'failed' ? (
            <View style={styles.failed}>
              <Text style={[typeV2.body, styles.center, { color: palette.secondary }]}>{t('beginner.learn.loadFailed')}</Text>
              <PillButton title={t('common.tryAgain')} variant="outline" onPress={() => setAttempt((n) => n + 1)} testID="learn-retry" />
            </View>
          ) : hidden ? (
            <PillButton title={t('beginner.learn.show')} variant="outline" onPress={() => setShown(true)} testID="learn-show" />
          ) : (
            <>
              <Text
                style={[arabicFullV2(ARABIC), styles.center, { color: palette.text, writingDirection: 'rtl' }]}
                accessibilityLanguage="ar"
                testID="learn-arabic"
              >
                {ayahs?.[index]}
              </Text>
              {current === 'loading' || current === 'offline' ? (
                // Never a silent blank: while it loads, or offline before its surah is on the phone, it says so.
                <Text style={[typeV2.meta, styles.center, styles.meaning, { color: palette.secondary }]} testID={`learn-meaning-${current}`}>
                  {current === 'loading' ? t('beginner.learn.meaningLoading') : t('beginner.learn.meaningOffline')}
                </Text>
              ) : current ? (
                <>
                  <MeaningText
                    meaning={current}
                    style={[typeV2.menu, styles.center, styles.meaning, { color: palette.text }]}
                    testID="learn-meaning"
                  />
                  <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={1.6} testID="learn-credit">
                    {t('beginner.learn.credit')}
                  </Text>
                </>
              ) : null}
            </>
          )}
        </View>

        {step !== 'recall' ? (
          <View style={styles.player}>
            <IconButton icon={backIcon()} label={t('beginner.learn.previous')} onPress={() => setIndex((i) => Math.max(0, i - 1))} testID="learn-previous" />
            <Tap
              onPress={onPlay}
              accessibilityRole="button"
              accessibilityLabel={playing ? t('beginner.learn.pause') : t('beginner.learn.play')}
              style={[styles.play, { backgroundColor: palette.primary }]}
              testID="learn-play"
            >
              <Ionicons name={playing ? 'pause' : 'play'} size={30} color={palette.onPrimary} style={playing ? undefined : styles.playGlyph} />
            </Tap>
            <IconButton
              icon={forwardIcon()}
              label={t('beginner.learn.nextAyah')}
              onPress={() => setIndex((i) => Math.min(total - 1, i + 1))}
              testID="learn-next-ayah"
            />
          </View>
        ) : (
          <View style={styles.player}>
            <PillButton title={t('beginner.learn.previous')} variant="outline" onPress={() => setIndex((i) => Math.max(0, i - 1))} testID="learn-previous" />
            <PillButton title={t('beginner.learn.nextAyah')} variant="outline" onPress={() => setIndex((i) => Math.min(total - 1, i + 1))} testID="learn-next-ayah" />
          </View>
        )}
        <Text style={[typeV2.meta, styles.center, styles.gutter, { color: palette.secondary }]} maxFontSizeMultiplier={1.6} testID="learn-voice">
          {t('beginner.learn.voice', { voice: voiceLabel(resolveVoice(LEARN_VOICE)) })}
        </Text>

        {/* The rest of the surah, quieter: a tap goes to that ayah. */}
        {ayahs ? (
          <View style={styles.rest}>
            {ayahs.map((arabic, i) =>
              i === index ? null : (
                <Tap
                  key={i}
                  onPress={() => setIndex(i)}
                  accessibilityRole="button"
                  accessibilityLabel={t('beginner.learn.ayahOf', { n: i + 1, total })}
                  style={[styles.other, { borderTopColor: palette.separator }]}
                  testID={`learn-ayah-${i + 1}`}
                >
                  <Text style={[arabicFullV2(20), styles.center, { color: palette.secondary, writingDirection: 'rtl' }]} accessibilityLanguage="ar">
                    {step === 'recall' ? '' : arabic}
                  </Text>
                  {step !== 'recall' && meanings[i] && typeof meanings[i] === 'object' ? (
                    <MeaningText
                      meaning={meanings[i] as Meaning}
                      style={[typeV2.body, styles.center, { color: palette.secondary }]}
                      testID={`learn-ayah-${i + 1}-meaning`}
                    />
                  ) : null}
                </Tap>
              ),
            )}
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.foot, { borderTopColor: palette.separator }]}>
        <PillButton title={t('beginner.learn.recite')} size="lg" onPress={onRecite} busy={saving} testID="learn-recite" />
      </View>
    </TopSafeAreaView>
  );
}

/**
 * The three steps as chips that wrap onto a second line rather than clip ("Without looking" is too long for a third of an
 * SE's width): the chosen one in ink.
 */
function StepChips({ value, onChange }: { value: LearnStep; onChange: (step: LearnStep) => void }) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const label = (s: LearnStep) => (s === 'listen' ? t('beginner.learn.listen') : s === 'repeat' ? t('beginner.learn.repeat') : t('beginner.learn.recall'));
  return (
    <View style={styles.chips} accessibilityRole="tablist" testID="learn-steps">
      {LEARN_STEPS.map((s) => {
        const selected = s === value;
        return (
          <Tap
            key={s}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(s);
            }}
            accessibilityRole="tab"
            accessibilityLabel={label(s)}
            accessibilityState={{ selected }}
            style={[styles.chip, selected ? { backgroundColor: palette.text } : { borderWidth: 1, borderColor: palette.outline }]}
            testID={`learn-step-${s}`}
          >
            <Text style={[typeV2.name, styles.center, { color: selected ? palette.bg : palette.text }]} maxFontSizeMultiplier={1.4}>
              {label(s)}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** Learned (BEGIN-8): it's memorized and part of the revision, how many they know, and the next surah on the path. */
function Learned({ sura, onDone, onNext }: { sura: number; onDone: () => void; onNext: (sura: number) => void }) {
  const { palette } = useTheme();
  const { pages } = useApp();
  const known = useMemo(() => knownSurahs(pages), [pages]);
  const next = nextSurahOnPath(known);
  const onPath = BEGINNER_SURAHS.filter((s) => known.has(s)).length;
  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.learned} testID="learn-learned">
        <View style={[styles.done, { backgroundColor: palette.accentSubtle }]}>
          <Ionicons name="checkmark" size={50} color={palette.accentText} />
        </View>
        <Text style={[styles.learnedTitle, styles.center, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.6} testID="learn-learned-title">
          {t('beginner.learn.learnedTitle', { surah: surahNameIn(sura) })}
        </Text>
        <Text style={[typeV2.body, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={1.6} testID="learn-learned-body">
          {t('beginner.learn.learnedBody', { count: known.size })}
        </Text>
        <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={1.6} testID="learn-learned-path">
          {t('beginner.learn.learned', { count: onPath, total: BEGINNER_SURAHS.length })}
        </Text>
        {next != null ? (
          <Tap
            onPress={() => onNext(next)}
            accessibilityRole="button"
            accessibilityLabel={`${t('beginner.learn.nextOnPath')}: ${t('beginner.learn.nextLabel', { surah: surahNameIn(next), ayahs: t('beginner.surahs.ayahs', { count: ayahCount(next) }) })}`}
            style={[styles.nextRow, { borderColor: palette.separator }]}
            testID="learn-learned-next"
          >
            <View style={styles.flex}>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
                {t('beginner.learn.nextOnPath')}
              </Text>
              <Text style={[typeV2.barTitle, { color: palette.text }]} maxFontSizeMultiplier={1.6} testID="learn-learned-next-name">
                {surahNameIn(next)}
                {' · '}
                {t('beginner.surahs.ayahs', { count: ayahCount(next) })}
              </Text>
            </View>
            <Ionicons name={forwardIcon()} size={18} color={palette.secondary} />
          </Tap>
        ) : (
          <Text style={[typeV2.body, styles.center, { color: palette.text }]} maxFontSizeMultiplier={1.6} testID="learn-learned-all">
            {t('beginner.learn.allDone')}
          </Text>
        )}
      </ScrollView>
      <View style={[styles.foot, { borderTopColor: palette.separator }]}>
        <PillButton title={t('beginner.learn.done')} size="lg" onPress={onDone} testID="learn-done" />
      </View>
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  content: { paddingTop: layoutV2.rowPad, paddingBottom: 24 },
  gutter: { paddingHorizontal: layoutV2.gutter },
  center: { textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
  hint: { marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { minHeight: 32, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  card: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 18, gap: 6, minHeight: 120, justifyContent: 'center', alignItems: 'stretch' },
  meaning: { marginTop: 4 },
  failed: { gap: 12, alignItems: 'center' },
  player: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 18, marginBottom: 8 },
  play: { width: PLAY, height: PLAY, borderRadius: PLAY / 2, alignItems: 'center', justifyContent: 'center' },
  // The play triangle's weight sits to the left of its box: nudged so it looks centred.
  playGlyph: { marginStart: 4 },
  rest: { marginTop: 18 },
  other: { paddingHorizontal: 20, paddingVertical: 12, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.75 },
  foot: { paddingHorizontal: layoutV2.gutter, paddingTop: 10, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth },
  learned: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32, gap: 10 },
  done: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  learnedTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
