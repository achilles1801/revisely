import React, { useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { RevoMark } from '../revo/RevoMark';
import { revoAvailable } from '../../lib/revo/availability';
import { openRevo } from '../../lib/revo/open';
import {
  HELP,
  helpPlainText,
  helpTextParts,
  topicsFor,
  type HelpScreen,
  type HelpTopic,
} from '../../lib/help/topics';

/** Past this text size the topics' marks drop out, so the words get the width (beside 46pt text they were specks). */
export const MARKS_UP_TO = 1.6;
/** The sheet's own controls (Ask Revo, Hide) stop growing here, like other sheets' chrome. */
const CHROME_MAX_SCALE = 1.4;
const MARK = 28;

function TopicText({ text }: { text: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[typeV2.body, { color: palette.secondary }]} accessibilityLabel={helpPlainText(text)}>
      {helpTextParts(text).map((part, i) =>
        part.kind === 'icon' ? (
          <Ionicons key={i} name={part.icon} size={16} color={palette.text} />
        ) : part.kind === 'label' ? (
          <Text key={i} style={{ color: palette.text, fontWeight: '500' }}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

function TopicRow({ topic, marks }: { topic: HelpTopic; marks: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={styles.topic} testID={`help-topic-${topic.id}`} accessible>
      {marks ? (
        <View style={[styles.mark, { backgroundColor: palette.fill }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name={topic.icon} size={16} color={palette.text} />
        </View>
      ) : null}
      <View style={styles.topicText}>
        <Text style={[typeV2.name, { color: palette.text }]}>{topic.title}</Text>
        <TopicText text={topic.text} />
      </View>
    </View>
  );
}

/**
 * A screen's help (HELP-1): its few topics, then "Ask Revo ›" (when the account has Revo; nothing is
 * counted until a question is sent) and "Hide help buttons" (HELP-2), and Done. Both actions run once
 * the sheet has gone. The topics follow Smart Tracking (HELP-3). Topic text is reading text: it grows
 * all the way with Dynamic Type and the sheet scrolls; the title and the two actions stop at 1.4×.
 */
export function HelpSheet({
  screen,
  visible,
  onClose,
  onHide,
}: {
  screen: HelpScreen;
  visible: boolean;
  onClose: () => void;
  /** "Hide help buttons": runs after the sheet has gone. */
  onHide: () => void;
}) {
  const { palette } = useTheme();
  const { user } = useApp();
  const { fontScale } = useWindowDimensions();
  const pending = useRef<null | 'revo' | 'hide'>(null);
  const entry = HELP[screen];
  const topics = topicsFor(screen, { smartTracking: user?.smartTrackingEnabled === true });
  const revo = revoAvailable(user);
  const marks = fontScale <= MARKS_UP_TO;

  const after = (action: 'revo' | 'hide') => {
    pending.current = action;
    onClose();
  };
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    if (action === 'revo') openRevo();
    else if (action === 'hide') onHide();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={entry.title}
      scroll
      onHidden={runPending}
      footer={{ label: 'Done', onPress: onClose, testID: 'help-done' }}
      testID="help-sheet"
    >
      <View testID={`help-sheet-${screen}`}>
        {topics.map((t) => (
          <TopicRow key={t.id} topic={t} marks={marks} />
        ))}
        {revo ? (
          <Tap onPress={() => after('revo')} accessibilityRole="button" style={styles.revo} testID="help-ask-revo">
            {marks ? <RevoMark size={MARK} /> : null}
            <View style={styles.revoLabel}>
              <Text style={[typeV2.name, { color: palette.link }]} maxFontSizeMultiplier={CHROME_MAX_SCALE}>
                Ask Revo
              </Text>
              <Ionicons name="chevron-forward" size={14} color={palette.link} />
            </View>
          </Tap>
        ) : null}
        <Tap
          onPress={() => after('hide')}
          accessibilityRole="button"
          style={[styles.hide, { borderTopColor: palette.separator }]}
          testID="help-hide"
        >
          <Text style={[typeV2.body, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX_SCALE}>
            Hide help buttons
          </Text>
        </Tap>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  topic: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  mark: { width: MARK, height: MARK, borderRadius: MARK / 2, alignItems: 'center', justifyContent: 'center', marginTop: -4 },
  topicText: { flex: 1, minWidth: 0, gap: 2 },
  revo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 14 },
  revoLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hide: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -16,
    paddingVertical: 10,
  },
});
