// "What's new" (NEW-1 to NEW-4): a few cards, one tap each, Next and then Done.
// - `required`: before Home, for an account set up before the release. No skip and no close; a swipe
//   right or Android's back goes to the card before (back on the first card leaves the app, and it is
//   there at the next launch). Each move is kept on the phone, so it reopens on the card left (NEW-2).
//   Done marks the release seen on the account.
// - `forced`: a tester's run at launch (Settings → Testing), the same, but Done writes nothing to the
//   account and turns the switch off.
// - `replay`: Settings → About → What's new, with a ✕, swiping both ways, nothing kept (NEW-3).
// The words are reading text and scroll at large sizes; the title stops at 1.6× (as onboarding's
// headline), the header and Next at 1.4×. Past 1.6× the pictures and the rows' marks drop out.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { HeroGlow } from '../v2/HeroGlow';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { Stepper } from '../Stepper';
import { RevoMark } from '../revo/RevoMark';
import {
  CURRENT_RELEASE,
  cardsFor,
  whatsNewParts,
  whatsNewPlainText,
  type WhatsNewCard,
  type WhatsNewRow,
} from '../../lib/help/whatsNew';
import { finishWhatsNew, saveCard, savedCard, setWhatsNewShowing } from '../../lib/whatsNew/state';
import { logger } from '../../lib/logger';
import { useNeedOpen } from './needs';
import { pictureFor } from './pictures';
import { RevoMoment } from './RevoMoment';
import { auth } from '../../lib/firebase';
import { greetingName } from '../../lib/displayName';
import { smartTrackingOn } from '../../lib/smartTracking';

export type WhatsNewMode = 'required' | 'forced' | 'replay';

/** Past this text size the pictures and the rows' marks drop out, and the words take the page. */
export const PICTURE_UP_TO = 1.6;
const TITLE_MAX_SCALE = 1.6;
const CHROME_MAX_SCALE = 1.4;

function CardText({ text, style }: { text: string; style: object }) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const glyph = Math.round(16 * fontScale);
  return (
    <Text style={style} accessibilityLabel={whatsNewPlainText(text)}>
      {whatsNewParts(text).map((part, i) =>
        part.kind === 'revo' ? (
          <View key={i} style={styles.inlineRevo}>
            <RevoMark size={Math.round(19 * fontScale)} />
          </View>
        ) : part.kind === 'icon' ? (
          <Ionicons key={i} name={part.icon} size={glyph} color={palette.text} />
        ) : part.kind === 'label' ? (
          <Text key={i} style={{ color: palette.text, fontWeight: '600' }}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

function Row({ row, marks }: { row: WhatsNewRow; marks: boolean }) {
  const { palette } = useTheme();
  return (
    // One element for VoiceOver, labelled with words only: iOS reads a child's glyph otherwise.
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${row.title}, ${whatsNewPlainText(row.text)}`}
      testID={`whats-new-row-${row.id}`}
    >
      {marks ? (
        <View style={[styles.rowMark, { backgroundColor: palette.fill }]}>
          <Ionicons name={row.icon} size={20} color={palette.text} />
        </View>
      ) : null}
      <View style={styles.rowWords}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{row.title}</Text>
        <CardText text={row.text} style={[typeV2.body, styles.rowText, { color: palette.secondary }]} />
      </View>
    </View>
  );
}

function Page({ card, step, total }: { card: WhatsNewCard; step: number; total: number }) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const roomy = fontScale <= PICTURE_UP_TO;
  const title = (
    <Text
      style={[typeV2.largeTitle, styles.center, { color: palette.text }]}
      accessibilityRole="header"
      accessibilityLabel={`Step ${step} of ${total}. ${card.title}`}
      maxFontSizeMultiplier={TITLE_MAX_SCALE}
      testID="whats-new-title"
    >
      {card.title}
    </Text>
  );
  if (card.rows) {
    return (
      <View style={styles.listPage}>
        {roomy ? (
          <View style={[styles.sparkles, { backgroundColor: palette.accentSubtle }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Ionicons name="sparkles" size={30} color={palette.subtleText} />
          </View>
        ) : null}
        {title}
        <View style={styles.rows}>
          {card.rows.map((r) => (
            <Row key={r.id} row={r} marks={roomy} />
          ))}
        </View>
      </View>
    );
  }
  // The picture takes the room the words leave; with none (or past 1.6×) the words sit in the middle.
  const picture = roomy && card.picture ? pictureFor(card.picture) : null;
  return (
    <>
      {picture ?? <View style={styles.flexSpacer} />}
      <View style={[styles.words, !picture && styles.wordsAlone]}>
        {title}
        {card.text ? (
          <CardText text={card.text} style={[typeV2.body, styles.center, styles.text, { color: palette.secondary }]} />
        ) : null}
      </View>
      {picture ? null : <View style={styles.flexSpacer} />}
    </>
  );
}

export function WhatsNewScreen({ mode, onClose }: { mode: WhatsNewMode; onClose?: () => void }) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user, markWhatsNewSeen } = useApp();
  const open = useNeedOpen(user);
  const release = CURRENT_RELEASE;
  const uid = user?.id;
  // Kept current: Revo's switch is read after launch, and its card joins the list when it says
  // everyone. The card on screen is kept by its id, so the list changing never moves it.
  const cards = useMemo(() => cardsFor(release, open), [release, open]);
  const keeps = mode !== 'replay';
  const [at, setAt] = useState<{ id: string | undefined; index: number }>(() => ({
    id: keeps && uid ? savedCard(uid, release.id) : undefined,
    index: 0,
  }));
  const found = cards.findIndex((c) => c.id === at.id);
  const index = found === -1 ? Math.min(at.index, cards.length - 1) : found;
  const scroll = useRef<ScrollView>(null);
  const finishing = useRef(false);
  const card = cards[index];
  const last = index >= cards.length - 1;

  // While it is on screen, a widget's link waits for Done (NEW-4).
  useEffect(() => {
    if (!keeps) return;
    setWhatsNewShowing(true);
    return () => setWhatsNewShowing(false);
  }, [keeps]);

  const go = useCallback(
    (next: number) => {
      const to = Math.max(0, Math.min(cards.length - 1, next));
      setAt({ id: cards[to].id, index: to });
      if (keeps && uid) saveCard(uid, release.id, cards[to].id);
    },
    [cards, keeps, uid, release.id],
  );

  // Each card starts at its top, and shows it can scroll when it can.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    const t = setTimeout(() => scroll.current?.flashScrollIndicators(), 350);
    if (card) AccessibilityInfo.announceForAccessibility(`Step ${index + 1} of ${cards.length}. ${card.title}`);
    return () => clearTimeout(t);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = useCallback(() => {
    if (finishing.current) return;
    if (mode === 'replay') {
      onClose?.();
      return;
    }
    finishing.current = true;
    if (!uid) return;
    // The account's mark first: it is what takes the walkthrough away (the phone's state follows).
    if (mode === 'required') {
      markWhatsNewSeen(release.id).catch((err) => logger.warn("Could not mark What's new seen", err));
    }
    finishWhatsNew(uid);
  }, [mode, onClose, uid, markWhatsNewSeen, release.id]);

  // Android's back: the card before; on the first, leave (required) or close (replay).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) {
        go(index - 1);
        return true;
      }
      if (mode === 'replay') {
        onClose?.();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [index, go, mode, onClose]);

  const back = Gesture.Fling()
    .direction(Directions.RIGHT)
    .runOnJS(true)
    .onEnd(() => go(index - 1));
  const forward = Gesture.Fling()
    .direction(Directions.LEFT)
    .enabled(mode === 'replay')
    .runOnJS(true)
    .onEnd(() => go(index + 1));

  if (!card) return null;
  const chrome = Math.min(fontScale, CHROME_MAX_SCALE);
  const advance = () => (last ? done() : go(index + 1));

  // A moment plays full screen and ends on its own buttons (past 1.6× text, its words as any card's).
  if (card.moment === 'revo' && fontScale <= PICTURE_UP_TO) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.bg }]} testID={`whats-new-${mode}`}>
        <GestureDetector gesture={Gesture.Race(back, forward)}>
          <View style={styles.flex} testID={`whats-new-card-${card.id}`}>
            <RevoMoment
              key={card.id}
              step={index + 1}
              total={cards.length}
              title={card.title}
              text={card.text ?? ''}
              firstName={greetingName(user?.name, auth.currentUser?.displayName ?? null).split(' ')[0]}
              smartTracking={smartTrackingOn(user)}
              closable={mode === 'replay'}
              onNext={advance}
              onClose={onClose}
            />
          </View>
        </GestureDetector>
      </View>
    );
  }

  return (
    // Padded by the root provider's inset, not a native safe-area view: in the replay's native modal that
    // view finds no provider among its native ancestors and pads nothing, so the ✕ and the title sat in
    // the status bar, where iOS takes a tap for itself (E2E flow 16, Nov 2026). Right from the first frame.
    <View style={[styles.screen, { backgroundColor: palette.bg, paddingTop: insets.top }]} testID={`whats-new-${mode}`}>
      <HeroGlow />
      <View style={[styles.bar, { minHeight: 44 * chrome }]}>
        <View style={styles.barSide}>
          {mode === 'replay' ? (
            <Tap onPress={() => onClose?.()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} testID="whats-new-close">
              <Ionicons name="close" size={26} color={palette.text} />
            </Tap>
          ) : null}
        </View>
        <Text style={[typeV2.barTitle, styles.barTitle, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX_SCALE} numberOfLines={1}>
          What’s new
        </Text>
        <View style={styles.barSide} />
      </View>
      <GestureDetector gesture={Gesture.Race(back, forward)}>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator
          testID={`whats-new-card-${card.id}`}
        >
          <Page card={card} step={index + 1} total={cards.length} />
        </ScrollView>
      </GestureDetector>
      <View style={[styles.foot, { paddingBottom: Math.max(16, insets.bottom) }]}>
        <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Stepper total={cards.length} current={index + 1} />
        </View>
        <PillButton
          title={last ? 'Done' : 'Next'}
          size="lg"
          onPress={advance}
          testID={last ? 'whats-new-done' : 'whats-new-next'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layoutV2.gutter },
  barSide: { width: 60 },
  barTitle: { flex: 1, textAlign: 'center' },
  page: { flexGrow: 1, paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 16 },
  flexSpacer: { flex: 1 },
  words: { paddingTop: 22 },
  wordsAlone: { paddingTop: 16 },
  center: { textAlign: 'center' },
  text: { marginTop: 10, maxWidth: 340, alignSelf: 'center' },
  listPage: { flex: 1, justifyContent: 'center', paddingVertical: 8 },
  sparkles: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 18 },
  rows: { marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 12 },
  rowMark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowWords: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.23 },
  rowText: { marginTop: 2 },
  inlineRevo: { transform: [{ translateY: 4 }] },
  foot: { paddingHorizontal: layoutV2.gutter, paddingTop: 12 },
  dots: { alignItems: 'center', marginBottom: 16 },
});
