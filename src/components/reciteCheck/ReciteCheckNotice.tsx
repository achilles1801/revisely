import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';

/**
 * The AI notice the model's licence asks for (Quran Muaalem License 1.0, 2.1), in English and always in Arabic:
 * before the first check, and from the check's sheet and Settings → About afterwards. As prominent as the app's
 * other legal text, never smaller than body text. "This tool" stands for the licence's "This Quranic Teacher", as
 * it allows for a product that isn't a teacher.
 */
export const NOTICE_EN =
  'This tool is an artificial-intelligence model that may make mistakes. It is intended for assistance only and ' +
  'must not be relied upon. It is not a replacement for a proficient, authorized teacher, because the Quran is ' +
  'only received through oral transmission (mushafahah).';
export const NOTICE_AR =
  'هذه الأداة نموذج ذكاء اصطناعي قد يخطئ؛ فهي للإعانة فقط ولا يُعتمد عليها، وليست بديلاً عن معلّمٍ مُتقِنٍ ' +
  'مُجاز؛ لأنّ القرآن لا يُؤخذ إلا بالمشافهة.';

export function ReciteCheckNotice() {
  const { palette } = useTheme();
  return (
    <View style={styles.wrap} testID="recite-check-notice">
      <Text style={[typeV2.body, { color: palette.text }]}>{NOTICE_EN}</Text>
      <Text style={[arabicV2(19), styles.ar, { color: palette.text }]}>{NOTICE_AR}</Text>
      <Text style={[typeV2.meta, { color: palette.secondary }]}>
        Your recording goes to Revisely’s server to be checked. Software judges it; nobody listens to it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, paddingHorizontal: layoutV2.gutter, paddingVertical: 8 },
  ar: { writingDirection: 'rtl', textAlign: 'right' },
});
