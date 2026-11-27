// The tour's Revo slides (What's new 1.0.6, lib/whatsNew/tour): 1. Ask about any page (REVO-45), on the account's own
// next page; 2. In the books' own words (REVO-44), an example on An-Naml 23–35 with the books' real words (the approved
// tafsir mocks); 3. Just say what you want: the whole schedule built by Revo from a few words (REVO-43), said with its
// own mic (REVO-42). Pictures, never touched.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { RevoMark } from '../../revo/RevoMark';
import { arabicV2 } from '../../../theme/v2';
import { t as tr } from '../../../i18n';
import {
  PHONE,
  SCREEN_AT,
  along,
  curve,
  easeIn,
  easeInOut,
  easeOut,
  entering,
  lerp,
  onStage,
  seg,
} from '../../../lib/whatsNew/tour';
import { Anim, Asked, Bar, Chips, Field, Glint, RevoHeader, Ripple, Say, Screen, Sheet, T, at, stageAt, useStage, type Clock, type ScreenAt } from './parts';
import { FOOT_Y, LINE_H, MushafScreen, PAGE_BOX, WordsIn } from './screens';

/** A point of a screen's phone on the stage, wherever the screen and its camera are. */
export function pointOn(f: ScreenAt, x: number, y: number): [number, number] {
  'worklet';
  return onStage(x, y, f.scale ?? SCREEN_AT.scale, f.top ?? SCREEN_AT.top, f.zoom ?? 1, f.ox ?? 201, f.oy ?? 437, f.dx ?? 0);
}

/** A screen at rest, growing in over the slide's first moment, with the camera given. */
function resting(t: number, zoom = 1, ox = 201, oy = 437): ScreenAt {
  'worklet';
  const e = entering(t);
  return { scale: SCREEN_AT.scale * e.scale, top: SCREEN_AT.top + e.dy, opacity: e.opacity, zoom, ox, oy };
}

function PageChip({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.pageChip, { backgroundColor: palette.fill }]}>
      <Ionicons name="book-outline" size={14} color={palette.text} />
      <T style={[styles.chipText, { color: palette.text }]}>{label}</T>
    </View>
  );
}

// ------------------------------------------------------------------ 1. Ask about any page (REVO-45, REVO-44)
const HELD_LINE = 7;
const MENU_TOP = PAGE_BOX.top + (HELD_LINE + 1) * LINE_H + 10;

function VerseMenuSketch() {
  const { palette, isDark } = useTheme();
  const row = (icon: React.ReactNode, label: string, sub?: string, last = false) => (
    <View style={[styles.menuRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator }]}>
      <View style={styles.menuIcon}>{icon}</View>
      <View style={styles.flex}>
        <T style={[styles.menuText, { color: palette.text }]}>{label}</T>
        {sub ? <T style={[styles.meta, { color: palette.secondary }]}>{sub}</T> : null}
      </View>
    </View>
  );
  const ic = (name: React.ComponentProps<typeof Ionicons>['name']) => <Ionicons name={name} size={19} color={palette.text} />;
  return (
    <View style={[styles.menu, { backgroundColor: palette.sheet }, isDark ? { borderWidth: 1, borderColor: palette.outline } : [styles.menuShadow, { shadowColor: palette.shadow }]]}>
      {row(<RevoMark size={22} />, tr('verse.menu.askRevo'), tr('verse.menu.askRevoSubtitle'))}
      {row(ic('play'), tr('verse.menu.play'))}
      {row(ic('language-outline'), tr('verse.menu.translation'))}
      {row(ic('copy-outline'), tr('verse.menu.copy'))}
      {row(ic('share-outline'), tr('verse.menu.share'), undefined, true)}
    </View>
  );
}

export function AskSlide({ t, page, pageName }: { t: Clock; page: number; pageName: string }) {
  const { palette } = useTheme();
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now, along(now, [1.2, 1, 2.25, 2.05, 2.7, 2.05, 3.4, 1]), 390, 830);
  };
  const heldY = PAGE_BOX.top + HELD_LINE * LINE_H;
  return (
    <>
      <Screen t={t} place={place}>
        <MushafScreen
          page={page}
          under={
            <Anim t={t} box={[at(10, heldY + 1, 382, LINE_H - 2), { backgroundColor: palette.highlight, borderRadius: 8 }]} style={(now) => {
              'worklet';
              return { opacity: easeOut(seg(now, 6.45, 6.85)), transform: [{ scaleX: lerp(0.2, 1, easeOut(seg(now, 6.45, 6.95))) }] };
            }} />
          }
        />
        {/* The page settles, line by line from the top. */}
        <Anim t={t} box={[at(0, PAGE_BOX.top - 4, 402, 700), { backgroundColor: palette.bg }]} style={(now) => {
          'worklet';
          const u = seg(now, 0.2, 1.25);
          return { opacity: u >= 1 ? 0 : 1, transform: [{ translateY: Math.floor(u * 15) * LINE_H + (u * 15 - Math.floor(u * 15)) * LINE_H * 0.6 }] };
        }} />
        {/* Revo's R rises beside the page number like a new moon, with one soft ring. */}
        <Anim t={t} box={at(355, FOOT_Y - 15, 30, 30)} style={(now) => {
          'worklet';
          const u = easeOut(seg(now, 1.75, 2.45));
          return { opacity: u, transform: [{ translateY: (1 - u) * 16 }] };
        }}>
          <RevoMark size={30} />
        </Anim>
        <Ripple t={t} color={palette.primary} r={31} width={1.5} where={(now) => {
          'worklet';
          return [370, FOOT_Y, seg(now, 2.1, 2.95)];
        }} />
        {/* A tap: the R opens into Revo's sheet. */}
        <Anim t={t} box={[at(370 - 700, FOOT_Y - 700, 1400, 1400), { borderRadius: 700, backgroundColor: palette.sheet }]} style={(now) => {
          'worklet';
          return { opacity: now < 2.75 ? 0 : 1 - seg(now, 3.35, 3.6), transform: [{ scale: easeInOut(seg(now, 2.75, 3.45)) }] };
        }} />
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          const away = easeIn(seg(now, 5.85, 6.25));
          return { opacity: now < 3.2 ? 0 : seg(now, 3.2, 3.5) * (1 - away), transform: [{ translateY: away * 480 }] };
        }}>
          <Sheet top={400}>
            <RevoHeader />
            <PageChip label={pageName} />
            <View style={styles.sayBox}>
              <WordsIn t={t} text={tr('revo.tafsir.greetingPage')} from={3.5} to={4.6} style={[styles.say19, { color: palette.text }]} />
            </View>
            <Anim t={t} style={(now) => {
              'worklet';
              const u = easeOut(seg(now, 4.7, 5.2));
              return { opacity: u, transform: [{ translateY: (1 - u) * 10 }] };
            }} box={styles.chipsBox}>
              <Chips items={[tr('revo.tafsir.startPage1'), tr('revo.tafsir.startPage2'), tr('revo.tafsir.startPage3')]} />
            </Anim>
            <Field placeholder={tr('revo.composer.placeholder')} />
          </Sheet>
        </Anim>
        {/* A finger holds an ayah: its grey spreads, and Ask Revo leads the menu. */}
        <Anim t={t} box={at(69, MENU_TOP, 264)} style={(now) => {
          'worklet';
          const u = easeOut(seg(now, 6.85, 7.2));
          return { opacity: u, transform: [{ scale: lerp(0.9, 1, u) }] };
        }}>
          <VerseMenuSketch />
        </Anim>
        <Glint t={t} color={palette.primary} size={16} where={(now) => {
          'worklet';
          return [88, MENU_TOP + 12, seg(now, 7.2, 7.9)];
        }} />
      </Screen>
    </>
  );
}

// ------------------------------------------------------------------ 2. In the books' own words (REVO-44)
/** An example on An-Naml 32–35, the books' own words as the approved tafsir mocks quote them. */
const Q_GIFT = 'Why did she send a gift instead of answering?';
const A_GIFT =
  'She was testing him. A king would take the gift and leave them alone; a prophet would turn it down and want only their faith.';
const QUOTES = [
  {
    book: 'al-Tabari',
    letter: 'ط', // i18n-ignore (a book's initial)
    arabic: 'إن يكن نبيا لم يقبل الهدية، ولم يرضه منا إلا أن نتبعه على دينه', // i18n-ignore (the book's words)
    english: '“If he is a prophet he will not accept the gift, and nothing from us will please him but that we follow his religion.”',
    top: 388,
  },
  {
    book: 'Ibn Kathir',
    letter: 'ك', // i18n-ignore (a book's initial)
    arabic: 'سَأَبْعَثُ إِلَيْهِ بِهَدِيَّةٍ تَلِيقُ بِهِ وَأَنْظُرُ مَاذَا يَكُونُ جَوَابُهُ', // i18n-ignore (the book's words)
    english: '“I will send him a gift befitting for one of his status, and will wait and see what his response will be.”',
    top: 552,
  },
  {
    book: 'al-Qurtubi',
    letter: 'ق', // i18n-ignore (a book's initial)
    arabic: 'هَذَا مِنْ حُسْنِ نَظَرِهَا وَتَدْبِيرِهَا', // i18n-ignore (the book's words)
    english: '“This was from her good judgement and planning.”',
    top: 716,
  },
] as const;
const BOOKS = [...QUOTES.map((q) => ({ name: q.book, letter: q.letter })), { name: 'al-Sa’di', letter: 'س' }]; // i18n-ignore (a book's initial)
/** Where each book docks: its quote's mark (the phone's points), and when. */
const DOCK = [
  [28, QUOTES[0].top + 12, 1.6, 2.15],
  [28, QUOTES[1].top + 12, 2.0, 2.55],
  [28, QUOTES[2].top + 12, 2.35, 2.9],
] as const;
/**
 * The books circle the screen while it stands back (ORBIT_SHRINK of its size), clear of it, and behind it: its body
 * hides any of them that passes it, so none ever sits on its words (Majd, Nov 27 2026: the circles covered "From the
 * tafsir" and Memory). Only a docking book comes in front, at the end of its flight, onto its quote's mark in the margin.
 */
const ORBIT = { cx: 201, cy: 345, rx: 172, ry: 300 };
const ORBIT_SHRINK = 0.7;
/** How far along its flight a docking book comes in front of the screen: by then it is in the margin, left of the words. */
const FRONT_AT = [0.76, 0.86] as const;

/** Where book `i` is on the stage at `now`: its centre, scale, opacity, and how far it has docked (0 circling, 1 landed). */
function bookAt(now: number, i: number, place: (t: number) => ScreenAt): { x: number; y: number; s: number; o: number; k: number } {
  'worklet';
  const rise = easeOut(seg(now, 0.15, 1.1));
  const a = Math.PI / 3 + now * 0.85 + (i * Math.PI) / 2;
  let x = ORBIT.cx + ORBIT.rx * Math.sin(a) * rise;
  let y = ORBIT.cy - ORBIT.ry * Math.cos(a) * rise;
  const depth = (1 - Math.cos(a)) / 2;
  let s = (0.82 + 0.3 * depth) * (0.4 + 0.6 * rise);
  let o = Math.min(1, rise * 1.6) * (0.55 + 0.45 * depth);
  let k = 0;
  if (i < 3) {
    const d = DOCK[i];
    k = easeInOut(seg(now, d[2], d[3]));
    if (k > 0) {
      const f = place(now);
      const tgt = pointOn(f, d[0], d[1]);
      // Bowed out to the left of the screen, so the flight stays off its words until the mark.
      const p = curve([x, y], [-50, tgt[1] - 30], tgt, k);
      x = p[0];
      y = p[1];
      s = lerp(s, (24 / 52) * (f.scale ?? 1) * (f.zoom ?? 1), k);
      o = k >= 1 ? 1 - seg(now, d[3], d[3] + 0.25) : Math.max(o, k);
    }
  } else {
    const q = seg(now, 1.8, 2.4);
    s *= 1 - 0.4 * q;
    o *= 1 - q;
  }
  return { x, y, s, o, k };
}

function BookMark({ letter, size }: { letter: string; size: number }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.bookMark, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bubble, borderColor: palette.outline }]}>
      <T style={[arabicV2(size * 0.5), { color: palette.text }]}>{letter}</T>
    </View>
  );
}

function Quote({ t, q, i }: { t: Clock; q: (typeof QUOTES)[number]; i: number }) {
  const { palette } = useTheme();
  const [, , d0, d1] = DOCK[i];
  // Ibn Kathir's words write themselves under the camera; the others arrive as their book docks.
  const writes = i === 1 ? ([3.45, 4.25, 4.3, 4.9] as const) : ([d1 - 0.05, d1 + 0.45, d1 + 0.3, d1 + 0.8] as const);
  return (
    <View style={at(16, q.top, 370)}>
      <Anim t={t} style={(now) => {
        'worklet';
        return { opacity: seg(now, d0 + 0.3, d1) };
      }} box={styles.quoteHead}>
        <BookMark letter={q.letter} size={24} />
        <T style={[styles.name13, { color: palette.text }]}>{q.book}</T>
        <View style={styles.flex} />
        <T style={[styles.meta, { color: palette.secondary }]}>An-Naml 35</T>
      </Anim>
      <View style={styles.quoteBody}>
        <WordsIn t={t} text={q.arabic} from={writes[0]} to={writes[1]} rtl style={[arabicV2(16), { color: palette.text }]} />
        <View style={styles.gap6} />
        <WordsIn t={t} text={q.english} from={writes[2]} to={writes[3]} style={[styles.body14, { color: palette.secondary }]} />
      </View>
    </View>
  );
}

export function BooksSlide({ t }: { t: Clock }) {
  const { palette } = useTheme();
  const stage = useStage();
  const place = (now: number): ScreenAt => {
    'worklet';
    const f = resting(now, along(now, [3.0, 1, 3.55, 1.85, 4.95, 1.85, 5.55, 1]), 210, 640);
    // Standing back while the books circle it, then up to its size as they dock (its centre kept).
    const k = along(now, [1.3, ORBIT_SHRINK, 2.6, 1]);
    const full = f.scale ?? SCREEN_AT.scale;
    return { ...f, scale: full * k, top: (f.top ?? SCREEN_AT.top) + (PHONE.height * full * (1 - k)) / 2 };
  };
  /**
   * A book: behind the screen while it circles, in front for the end of its flight onto its mark. Its letter and name
   * take the stage's scale into their one scale (scaled from the circle's middle), so they stay crisp.
   */
  const book = (b: (typeof BOOKS)[number], i: number, front: boolean) => (
    <Anim key={b.name} t={t} box={styles.orbiter} style={(now) => {
      'worklet';
      const p = bookAt(now, i, place);
      const ahead = seg(p.k, FRONT_AT[0], FRONT_AT[1]);
      const k = stage ? stage.value : 1;
      const [x, y] = stageAt(p.x - 26 * p.s, p.y - 26 * p.s, k);
      return { opacity: p.o * (front ? ahead : 1 - ahead), transform: [{ translateX: x }, { translateY: y }, { scale: p.s * k }] };
    }}>
      <BookMark letter={b.letter} size={52} />
      {front ? null : (
        <T style={[styles.bookName, { color: palette.text }]} numberOfLines={1}>
          {b.name[0].toUpperCase() + b.name.slice(1)}
        </T>
      )}
    </Anim>
  );
  return (
    <>
      {/* The four books rise from behind the screen and circle it; three dock under the answer, al-Sa'di steps back. */}
      {BOOKS.map((b, i) => book(b, i, false))}
      <Screen t={t} place={place}>
        <MushafScreen page={379} foot={false} />
        <Sheet top={96}>
          <RevoHeader />
          <PageChip label="An-Naml, 3rd page" />
          <Asked>{Q_GIFT}</Asked>
          <Say size={15}>{A_GIFT}</Say>
        </Sheet>
        <View style={[at(16, 360, 370), styles.fromRow]}>
          <Ionicons name="library-outline" size={15} color={palette.secondary} />
          <T style={[styles.meta, { color: palette.secondary }]}>{tr('revo.tafsir.fromTheTafsir')}</T>
        </View>
        {QUOTES.map((q, i) => (
          <Quote key={q.book} t={t} q={q} i={i} />
        ))}
        {/* A tap on the quote: the whole passage, the quoted words in the page's grey. */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          const u = easeOut(seg(now, 5.0, 5.55));
          return { opacity: now < 5.0 ? 0 : 1, transform: [{ translateY: (1 - u) * 700 }] };
        }}>
          <Sheet top={150} dim={false}>
            <View style={styles.passageHead}>
              <T style={[styles.sheetTitle, { color: palette.text }]}>Ibn Kathir</T>
              <T style={[styles.done, { color: palette.link }]}>{tr('common.done')}</T>
            </View>
            <T style={[styles.passage, { color: palette.text }]}>
              Then she resorted to peaceful means, seeking a truce and trying to placate Sulayman, and said: (But verily, I am going
              to send him a present, and see with what the messengers return.) meaning,{' '}
              <T style={{ backgroundColor: palette.highlight }}>
                ‘I will send him a gift befitting for one of his status, and will wait and see what his response will be.
              </T>{' '}
              Perhaps he will accept that and leave us alone, or he will impose a tax which we can pay him every year, so that he
              will not fight us and wage war against us.’
            </T>
          </Sheet>
        </Anim>
        {/* Back to the mushaf: An-Naml 35 in grey, and the quote settles beside it. */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          const u = easeOut(seg(now, 6.25, 6.75));
          return { opacity: u, transform: [{ translateX: (1 - u) * 40 }] };
        }}>
          <MushafScreen
            page={379}
            under={
              <Anim t={t} box={[at(8, PAGE_BOX.top + 14 * LINE_H, 386, LINE_H), { backgroundColor: palette.highlight, borderRadius: 8 }]} style={(now) => {
                'worklet';
                return { opacity: easeInOut(seg(now, 6.85, 7.3)) };
              }} />
            }
          />
        </Anim>
        {/* Over the header, so it never covers the page's words. */}
        <Anim t={t} box={at(14, 16, 374)} style={(now) => {
          'worklet';
          const u = easeOut(seg(now, 6.95, 7.65));
          return { opacity: seg(now, 6.95, 7.2), transform: [{ translateY: (1 - u) * 260 }, { scale: lerp(0.8, 1, u) }] };
        }}>
          <View style={[styles.card, { backgroundColor: palette.sheet, borderColor: palette.outline }]}>
            <View style={styles.quoteHead}>
              <BookMark letter={QUOTES[1].letter} size={24} />
              <T style={[styles.name13, { color: palette.text }]}>Ibn Kathir</T>
              <View style={styles.flex} />
              <T style={[styles.meta, { color: palette.secondary }]}>An-Naml 35</T>
            </View>
            <T style={[arabicV2(15), styles.rtl, { color: palette.text }]}>{QUOTES[1].arabic}</T>
          </View>
        </Anim>
      </Screen>
      {BOOKS.slice(0, 3).map((b, i) => book(b, i, true))}
    </>
  );
}

// ------------------------------------------------------------------ 3. Revo, by your side (REVO-46, REVO-43, REVO-25, REVO-42)
/** Edit schedule: as it was, or filled in from Revo's draft (not saved until Save, REVO-43). */
function EditScheduleSketch({ filled = false }: { filled?: boolean }) {
  const { palette } = useTheme();
  const rows = filled
    ? [
        ['Today · Juz 28', 'Al-Mujadila · 6 pages'],
        ['Fri · Rest day', 'Fridays off'],
        ['Sat · Juz 28', 'Al-Mujadila to Al-Hashr'],
      ]
    : [
        ['Today · Juz 28', 'Al-Mujadila to Al-Hashr · 10 pages'],
        ['Fri · Juz 28', 'Al-Hashr to Al-Jumu‘ah'],
        ['Sat · Juz 29', 'Al-Mulk to Al-Qalam'],
      ];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>
      <Bar
        title="Edit schedule"
        end={
          <View style={[styles.savePill, { backgroundColor: palette.primary }]}>
            <T style={[styles.button, { color: palette.onPrimary }]}>Save</T>
          </View>
        }
      />
      <View style={at(16, 114, 370)}>
        <T style={[styles.title22, { color: palette.text }]}>{filled ? '6 pages a day' : '10 pages a day'}</T>
        <T style={[styles.meta, { color: palette.secondary }]}>{`Every page comes round every ${filled ? 21 : 11} days`}</T>
      </View>
      {rows.map(([a, b], i) => (
        <View key={a} style={[at(0, 176 + i * 62, 402, 62), styles.listRow, { borderBottomColor: palette.separator }]}>
          <View style={styles.flex}>
            <T style={[styles.name, { color: palette.text }]}>{a}</T>
            <T style={[styles.meta, { color: palette.secondary }]}>{b}</T>
          </View>
          <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
        </View>
      ))}
    </View>
  );
}

const DRAFT_ROWS = [
  ['A day', '10 pages', '6 pages'],
  ['A round', 'every 11 days', 'every 21 days'],
  ['Rest', 'none', 'Fridays'],
] as const;

function DraftCard({ t }: { t: Clock }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.draft, { borderColor: palette.outline }]}>
      <View style={styles.quoteHead}>
        <Ionicons name="calendar-outline" size={18} color={palette.text} />
        <T style={[styles.name, { color: palette.text }]}>A new schedule</T>
      </View>
      <T style={[styles.meta, styles.draftLine, { color: palette.secondary }]}>
        6 pages a day with Fridays off: every page comes round every 21 days.
      </T>
      {DRAFT_ROWS.map(([label, old, now], i) => (
        <View key={label} style={[styles.draftRow, { borderTopColor: palette.separator }]}>
          <T style={[styles.meta, styles.draftLabel, { color: palette.secondary }]}>{label}</T>
          <T style={[styles.meta, styles.flex, styles.struck, { color: palette.secondary }]}>{old}</T>
          <Anim t={t} style={(n) => {
            'worklet';
            const u = easeOut(seg(n, 4.15 + i * 0.3, 4.6 + i * 0.3));
            return { opacity: u, transform: [{ translateY: (1 - u) * 12 }] };
          }}>
            <T style={[styles.name14, { color: palette.text }]}>{now}</T>
          </Anim>
        </View>
      ))}
      <View style={styles.draftButtons}>
        <View style={[styles.pill, { backgroundColor: palette.primary }]}>
          <T style={[styles.button, { color: palette.onPrimary }]}>Check in Edit schedule</T>
        </View>
        <View style={[styles.pill, styles.outlinePill, { borderColor: palette.outline }]}>
          <T style={[styles.button, { color: palette.text }]}>Not now</T>
        </View>
      </View>
    </View>
  );
}

const ASKED = 'I can only do 6 pages a day, and Fridays are busy';

/** Revo's field while its own mic listens (REVO-42): the words as they're heard, and the stop button. */
function ListeningField({ t, from, to }: { t: Clock; from: number; to: number }) {
  const { palette } = useTheme();
  return (
    <View style={styles.fieldRow}>
      <View style={[styles.plus, { backgroundColor: palette.fill }]}>
        <Ionicons name="add" size={22} color={palette.text} />
      </View>
      <View style={[styles.listening, { borderColor: palette.outline, backgroundColor: palette.fill }]}>
        <View style={styles.flex}>
          <Anim t={t} box={styles.listeningHint} style={(now) => {
            'worklet';
            return { opacity: 1 - seg(now, from, from + 0.15) };
          }}>
            <T style={[styles.body16, { color: palette.secondary }]}>Listening…</T>
          </Anim>
          <WordsIn t={t} text={ASKED} from={from} to={to} style={[styles.body16, { color: palette.text }]} />
        </View>
        <View style={[styles.stopButton, { backgroundColor: palette.primary }]}>
          <View style={[styles.stopSquare, { backgroundColor: palette.onPrimary }]} />
        </View>
      </View>
    </View>
  );
}

export function ScheduleSlide({ t }: { t: Clock }) {
  const { palette } = useTheme();
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now);
  };
  return (
    <Screen t={t} place={place}>
      <EditScheduleSketch />
      {/* Checked in Edit schedule at the end: the whole week filled in, ready to save. */}
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        return { opacity: easeInOut(seg(now, 5.8, 6.2)) };
      }}>
        <EditScheduleSketch filled />
      </Anim>
      {/* Revo's sheet over Edit schedule: tell it how much and when; its own mic hears the words. */}
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        const up = easeOut(seg(now, 0.75, 1.3));
        return { opacity: now < 3.2 ? seg(now, 0.75, 0.9) : 1 - seg(now, 3.2, 3.45), transform: [{ translateY: (1 - up) * 560 }] };
      }}>
        <Sheet top={330}>
          <RevoHeader />
          <View style={styles.sayBox}>
            <T style={[styles.say19, { color: palette.text }]}>Tell me how much you can revise and when, and I’ll build the whole schedule.</T>
          </View>
          <View style={styles.flex} />
          <ListeningField t={t} from={1.6} to={2.9} />
        </Sheet>
      </Anim>
      {[0, 1, 2].map((k) => (
        <Ripple key={k} t={t} color={palette.primary} r={16} where={(now) => {
          'worklet';
          return [361, 806, seg(now, 1.45 + k * 0.45, 2.35 + k * 0.45)];
        }} />
      ))}
      {/* Sent: Revo builds the whole schedule, and the new figures roll in. */}
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        const down = easeIn(seg(now, 5.7, 6.15));
        return { opacity: seg(now, 3.15, 3.4) * (1 - down), transform: [{ translateY: down * 520 }] };
      }}>
        <Sheet top={150}>
          <RevoHeader />
          <Asked>{ASKED}</Asked>
          <Anim t={t} box={styles.dots} style={(now) => {
            'worklet';
            return { opacity: now < 3.5 ? 1 : 1 - seg(now, 3.5, 3.6) };
          }}>
            {[1, 0.6, 0.3].map((o) => (
              <View key={o} style={[styles.dot, { backgroundColor: palette.secondary, opacity: o }]} />
            ))}
          </Anim>
          <Anim t={t} style={(now) => {
            'worklet';
            const u = easeOut(seg(now, 3.55, 4.0));
            return { opacity: u, transform: [{ translateY: (1 - u) * 14 }] };
          }}>
            <Say>Then 6 pages a day with Fridays off: each page comes round every 21 days instead of 11.</Say>
            <DraftCard t={t} />
          </Anim>
          <View style={styles.flex} />
          <Field placeholder={tr('revo.composer.placeholder')} />
        </Sheet>
      </Anim>
      <Glint t={t} color={palette.primary} size={20} where={(now) => {
        'worklet';
        return [150, 536, seg(now, 5.1, 5.6)];
      }} />
      <Glint t={t} color={palette.primary} size={18} where={(now) => {
        'worklet';
        return [150, 128, seg(now, 6.25, 6.8)];
      }} />
      <Glint t={t} color={palette.primary} size={16} where={(now) => {
        'worklet';
        return [360, 84, seg(now, 6.5, 7.1)];
      }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pageChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginTop: 4 },
  chipText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  sayBox: { marginTop: 14 },
  say19: { fontSize: 19, lineHeight: 27, letterSpacing: -0.2 },
  chipsBox: { marginTop: 'auto' },
  menu: { borderRadius: 14, overflow: 'hidden' },
  menuShadow: { shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  menuIcon: { width: 24, alignItems: 'center' },
  menuText: { fontSize: 16, lineHeight: 21 },
  meta: { fontSize: 13, lineHeight: 18 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  name13: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  name14: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  body14: { fontSize: 14, lineHeight: 19 },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  title22: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  sheetTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  done: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quoteHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quoteBody: { marginStart: 32, marginTop: 6 },
  gap6: { height: 6 },
  bookMark: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  orbiter: { position: 'absolute', left: 0, top: 0, width: 52, alignItems: 'center', transformOrigin: '0 0' },
  bookName: { marginTop: 4, width: 110, textAlign: 'center', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  passageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  passage: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  savePill: { height: 30, paddingHorizontal: 14, borderRadius: 15, justifyContent: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  draft: { marginTop: 14, borderWidth: 1, borderRadius: 16, padding: 14 },
  draftLine: { marginTop: 4, marginBottom: 8 },
  draftRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  draftLabel: { width: 70 },
  struck: { textDecorationLine: 'line-through' },
  draftButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center' },
  outlinePill: { borderWidth: 1 },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 40 },
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  listening: { flex: 1, minHeight: 58, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingStart: 16, paddingEnd: 6, paddingVertical: 6 },
  listeningHint: { position: 'absolute', left: 0, top: 0 },
  body16: { fontSize: 16, lineHeight: 22 },
  stopButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 11, height: 11, borderRadius: 2 },
  dots: { flexDirection: 'row', gap: 5, marginTop: 18 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
