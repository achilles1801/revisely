// The account's picture (ACCOUNT-4, ACCOUNT-7): its photo, or the first letter of the name when there is none (Majd, Nov 26
// 2026: "if theres no pfp it should just be the first letter of their name"). With Premium it sits in Premium's ring
// (palette.premium, the gradient Recite's mic badge has). Optionally the latest badge at its lower corner (Home) and a
// camera at the same corner (Account, where the picture can be changed).
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import type { Milestone } from '../../lib/badges';
import { BadgeMark } from './BadgeMark';

export function ProfilePicture({
  size,
  photoUrl,
  initial,
  premium,
  badge,
  camera = false,
  testID,
}: {
  size: number;
  photoUrl?: string | null;
  initial: string;
  /** Premium's ring around it. */
  premium: boolean;
  /** The latest badge at its lower corner. */
  badge?: Milestone | null;
  /** A camera at its lower corner (the picture can be changed). */
  camera?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  const large = size >= 64;
  const ringW = large ? 2.5 : 1.5;
  const gap = large ? 2.5 : 1;
  const outer = premium ? size + 2 * (ringW + gap) : size;
  const showPhoto = !!photoUrl && !failed;
  const picture = (
    <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.fill, overflow: 'hidden' }]}>
      {showPhoto ? (
        <Image
          source={{ uri: photoUrl! }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
          testID={testID ? `${testID}-photo` : undefined}
        />
      ) : (
        <Text
          style={[typeV2.name, { color: palette.text, fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.52) }]}
          maxFontSizeMultiplier={1}
          testID={testID ? `${testID}-initial` : undefined}
        >
          {initial}
        </Text>
      )}
    </View>
  );
  const corner = large ? 30 : 17;
  return (
    <View style={{ width: outer, height: outer }} testID={testID}>
      {premium ? (
        <LinearGradient
          colors={palette.premium as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.center, { width: outer, height: outer, borderRadius: outer / 2 }]}
          testID={testID ? `${testID}-premium` : undefined}
        >
          <View style={[styles.center, { width: size + 2 * gap, height: size + 2 * gap, borderRadius: (size + 2 * gap) / 2, backgroundColor: palette.bg }]}>
            {picture}
          </View>
        </LinearGradient>
      ) : (
        picture
      )}
      {camera ? (
        <View style={[styles.corner, styles.center, { width: corner, height: corner, borderRadius: corner / 2, borderWidth: 2.5, backgroundColor: palette.fill, borderColor: palette.bg }]}>
          <Ionicons name="camera" size={15} color={palette.text} />
        </View>
      ) : badge ? (
        <View style={[styles.corner, { padding: 1.5, borderRadius: corner, backgroundColor: palette.bg }]} testID={testID ? `${testID}-badge` : undefined}>
          <BadgeMark milestone={badge} size={corner} number={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', right: -4, bottom: -4 },
});
