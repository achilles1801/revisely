import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { Stepper } from '../../components/Stepper';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';
import {
  parseMemorizationInput,
  applyEntriesToPages,
  ConversationTurn,
  NotSignedInError,
} from '../../lib/parseMemorization';

type NavigationProp = NativeStackNavigationProp<
  OnboardingStackParamList,
  'NaturalLanguageInput'
>;
type RouteProps = RouteProp<OnboardingStackParamList, 'NaturalLanguageInput'>;

const PLACEHOLDER =
  "e.g. I memorized the last 3 juz, half of juz 17, and just started Al-Baqarah";

export default function NaturalLanguageInputScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { journeyStage } = route.params;
  const { pages, updatePages } = useApp();

  const [text, setText] = useState('');
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const baseTextRef = useRef('');

  // Pulsing ring around the mic button while listening.
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (listening) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
  }, [listening, pulse]);

  const pulseAnim = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.6 }],
  }));

  const displayedText = listening
    ? (baseTextRef.current + (interim ? ' ' + interim : '')).trimStart()
    : text;
  const trimmed = displayedText.trim();
  const canSubmit = trimmed.length > 0 && !loading && !listening;

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    if (event.isFinal) {
      const merged = (baseTextRef.current + ' ' + transcript).trim();
      baseTextRef.current = merged;
      setText(merged);
      setInterim('');
    } else {
      setInterim(transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    setInterim('');
  });

  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setInterim('');
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      setError(`Couldn't hear you: ${event.message ?? event.error}`);
    }
  });

  useEffect(() => {
    return () => {
      ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  const handleMicPress = async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    setError(null);
    const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perms.granted) {
      setError(
        'Microphone permission is needed for voice. You can enable it in Settings, or just type instead.',
      );
      return;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError("Voice input isn't available on this device. Type your answer instead.");
      return;
    }
    baseTextRef.current = text;
    setInterim('');
    setListening(true);
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
      });
    } catch (e: any) {
      setListening(false);
      setError(e?.message ?? "Couldn't start voice input.");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const result = await parseMemorizationInput(trimmed, history);

      if (result.needs_clarification && result.clarification_question) {
        setHistory([
          ...history,
          { role: 'user', content: trimmed },
          { role: 'assistant', content: result.clarification_question },
        ]);
        setPendingQuestion(result.clarification_question);
        setText('');
        setLoading(false);
        return;
      }
      if (result.entries.length === 0) {
        setError(
          "I couldn't pick anything out of that. Try naming a juz or surah, or use the checklist below.",
        );
        setLoading(false);
        return;
      }

      const { pages: updated, changedPageNumbers } = applyEntriesToPages(pages, result.entries);
      await updatePages(updated, changedPageNumbers);
      navigation.navigate('JuzSelection', { journeyStage });
    } catch (e: any) {
      if (e instanceof NotSignedInError || e?.code === 'functions/unauthenticated') {
        setError(
          "We couldn't verify your sign-in. Try restarting the app and signing in again.",
        );
      } else {
        setError(e?.message ?? 'Something went wrong. Please try again or use the checklist.');
      }
      setLoading(false);
    }
  };

  const handleSkipToChecklist = () => navigation.navigate('JuzSelection', { journeyStage });
  const handleStartOver = () => {
    setHistory([]);
    setPendingQuestion(null);
    setText('');
    setError(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topRow}>
            <PressableScale
              onPress={() => navigation.goBack()}
              haptic="light"
              style={styles.backButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color={theme.textSecondary} />
            </PressableScale>
            <Stepper total={4} current={2} />
          </View>

          <Text style={styles.headline}>What have you memorized?</Text>
          <Text style={styles.subtext}>
            Describe it in your own words. We'll mark it for you, and you can review on the next screen.
          </Text>

          {history.length > 0 && (
            <View style={styles.historyBlock}>
              {history.map((turn, idx) => {
                const isUser = turn.role === 'user';
                return (
                  <View
                    key={idx}
                    style={[
                      styles.bubble,
                      isUser ? styles.userBubble : styles.aiBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        { color: isUser ? theme.textInverse : theme.textPrimary },
                      ]}
                    >
                      {turn.content}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={displayedText}
              onChangeText={(v) => {
                if (listening) return;
                setText(v);
                baseTextRef.current = v;
              }}
              placeholder={pendingQuestion ? 'Your reply…' : PLACEHOLDER}
              placeholderTextColor={theme.textMuted}
              multiline
              editable={!loading && !listening}
              autoFocus
              textAlignVertical="top"
            />
            <View style={styles.micWrapper}>
              {listening && (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.micPulse, pulseAnim, { backgroundColor: theme.error }]}
                />
              )}
              <PressableScale
                onPress={handleMicPress}
                haptic="medium"
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={listening ? 'Stop recording' : 'Start recording'}
                style={[
                  styles.micButton,
                  listening
                    ? { backgroundColor: theme.error }
                    : { backgroundColor: theme.accent },
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={listening ? 'stop' : 'mic'}
                  size={20}
                  color={theme.textInverse}
                />
              </PressableScale>
            </View>
          </View>

          {listening && (
            <Text style={styles.listeningText}>
              Listening… tap stop when you're done.
            </Text>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={theme.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {history.length > 0 && (
            <PressableScale onPress={handleStartOver} haptic="light" style={styles.linkRow}>
              <Text style={styles.linkText}>Start over</Text>
            </PressableScale>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.accent} />
              <Text style={styles.loadingText}>Reading your message…</Text>
            </View>
          ) : (
            <Button
              title={pendingQuestion ? 'Send' : 'Continue'}
              onPress={handleSubmit}
              variant="primary"
              disabled={!canSubmit}
              style={styles.submitButton}
            />
          )}
          <PressableScale
            onPress={handleSkipToChecklist}
            haptic="light"
            style={styles.skipRow}
            disabled={loading}
          >
            <Text style={styles.skipText}>I'd rather use the checklist instead</Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    flex: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xl,
    },
    backButton: { padding: spacing.xxs },
    headline: {
      ...typography.displaySmall,
      color: theme.textPrimary,
      marginBottom: spacing.xxs,
    },
    subtext: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginBottom: spacing.lg,
    },
    historyBlock: { marginBottom: spacing.md, gap: spacing.sm },
    bubble: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      maxWidth: '85%',
    },
    userBubble: {
      backgroundColor: theme.accent,
      alignSelf: 'flex-end',
      borderBottomRightRadius: radius.xs,
    },
    aiBubble: {
      backgroundColor: theme.bgAlt,
      alignSelf: 'flex-start',
      borderBottomLeftRadius: radius.xs,
    },
    bubbleText: { ...typography.bodyMedium },
    inputWrapper: { position: 'relative' },
    input: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      backgroundColor: theme.bgAlt,
      borderRadius: radius.md,
      padding: spacing.md,
      paddingRight: 64,
      minHeight: 132,
    },
    micWrapper: {
      position: 'absolute',
      right: spacing.sm,
      bottom: spacing.sm,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micPulse: {
      position: 'absolute',
      width: 44,
      height: 44,
      borderRadius: radius.full,
    },
    micButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listeningText: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      marginTop: spacing.sm,
      textAlign: 'center',
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      backgroundColor: theme.errorBg,
      borderRadius: radius.sm,
      padding: spacing.sm,
      marginTop: spacing.sm,
    },
    errorText: { ...typography.bodySmall, color: theme.error, flex: 1 },
    linkRow: { marginTop: spacing.md, alignSelf: 'flex-start' },
    linkText: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      textDecorationLine: 'underline',
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
      gap: spacing.sm,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 48,
    },
    loadingText: { ...typography.bodyMedium, color: theme.textSecondary },
    submitButton: { width: '100%' },
    skipRow: { alignItems: 'center', paddingVertical: spacing.xs },
    skipText: {
      ...typography.bodySmall,
      color: theme.textMuted,
      textDecorationLine: 'underline',
    },
  });
