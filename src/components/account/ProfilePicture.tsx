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
  // What is drawn, and a new photo loading on top of it: a change of photo never blanks or flashes (HOME-8). Undefined
  // (the phone's copy not read yet, a moment as the app starts): neither a photo nor the letter, so neither flashes.
  const [shown, setShown] = useState<string | null>(photoUrl ?? null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (photoUrl === undefined || photoUrl === shown) {
      setNext(null);
      return;
    }
    if (photoUrl == null || shown == null || failed) {
      setShown(photoUrl);
      setNext(null);
      setFailed(false);
      return;
    }
    setNext(photoUrl);
  }, [photoUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const large = size >= 64;
  const ringW = large ? 2.5 : 1.5;
  const gap = large ? 2.5 : 1;
  const outer = premium ? size + 2 * (ringW + gap) : size;
  const showPhoto = !!shown && !failed;
  const picture = (
    <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.fill, overflow: 'hidden' }]}>
      {showPhoto ? (
        <Image
          source={{ uri: shown! }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
          testID={testID ? `${testID}-photo` : undefined}
        />
      ) : photoUrl === undefined ? null : (
        <Text
          style={[typeV2.name, { color: palette.text, fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.52) }]}
          maxFontSizeMultiplier={1}
          testID={testID ? `${testID}-initial` : undefined}
        >
          {initial}
        </Text>
      )}
      {next ? (
        <Image
          source={{ uri: next }}
          style={[StyleSheet.absoluteFill, { opacity: 0 }]}
          onLoad={() => {
            setShown(next);
            setNext(null);
            setFailed(false);
          }}
          onError={() => setNext(null)}
          accessibilityIgnoresInvertColors
        />
      ) : null}
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
