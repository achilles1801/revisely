import React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { meaningText, type Meaning } from '../../lib/beginner/learn';
import { typeV2 } from '../../theme/v2';

/**
 * An ayah's meaning on a beginner's screens (BEGIN-4, BEGIN-7), as TRANS-1 asks: the text exactly as given, a footnote's
 * number raised in place, and its footnotes under it (nothing cut).
 */
export function MeaningText({ meaning, style, testID }: { meaning: Meaning; style: TextStyle | TextStyle[]; testID?: string }) {
  const { palette } = useTheme();
  return (
    <>
      <Text style={style} accessibilityLabel={meaningText(meaning)} testID={testID}>
        {meaning.segments.map((seg, i) =>
          'footnote' in seg ? (
            <Text key={i} style={styles.mark}>
              {seg.footnote}
            </Text>
          ) : (
            seg.text
          ),
        )}
      </Text>
      {meaning.footnotes.length > 0 ? (
        <View style={styles.footnotes} testID={testID ? `${testID}-footnotes` : undefined}>
          {meaning.footnotes.map((f, i) => (
            <Text key={i} style={[typeV2.meta, { color: palette.secondary }]}>
              {f.mark ? <Text style={styles.mark}>{`${f.mark} `}</Text> : null}
              {f.text}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Already raised (superscript digits): a little smaller.
  mark: { fontSize: 12 },
  footnotes: { gap: 4, marginTop: 4 },
});
