import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList, JourneyStage } from '../../navigation/OnboardingNavigator';
import { Stepper } from '../../components/Stepper';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { TopBar } from '../../components/v2/TopBar';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { layoutV2, typeV2 } from '../../theme/v2';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'JourneySelect'>;

const OPTIONS: Array<{ value: JourneyStage; title: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'in_progress', title: 'In Progress', description: 'I’ve memorized part of the Quran', icon: 'flame-outline' },
  { value: 'complete', title: 'Complete', description: 'I’ve memorized the whole Quran', icon: 'star-outline' },
];

export default function JourneySelectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { palette } = useTheme();
  const haptics = useHaptics();
  const [selectedStage, setSelectedStage] = useState<JourneyStage>('in_progress');

  // No pre-seeding here. JuzSelection initializes its local pendingChanges
  // buffer from the journeyStage param and only flushes to global state on
  // Continue. This screen's tap is just a navigation.
  const handleContinue = () => {
    navigation.navigate('JuzSelection', { journeyStage: selectedStage });
  };

  const totalSteps = 3;

  // The two answers are rows on hairlines, each with its mark; the chosen
  // one carries a check. The one action sits at the foot.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="journey-select">
      <TopBar onBack={() => navigation.goBack()} center={<Stepper total={totalSteps} current={1} />} />
      <ScrollView contentContainerStyle={v2.scroll}>
        <Text
          style={[typeV2.title, v2.headline, { color: palette.text }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.6}
        >
          Where are you in your journey?
        </Text>
        <View
          style={[v2.list, { borderTopColor: palette.separator }]}
          accessibilityRole="radiogroup"
        >
          {OPTIONS.map((option) => {
            const isSelected = selectedStage === option.value;
            return (
              <Tap
                key={option.value}
                onPress={() => {
                  if (isSelected) return;
                  haptics.selection();
                  setSelectedStage(option.value);
                }}
                accessibilityRole="radio"
                accessibilityLabel={`${option.title}. ${option.description}`}
                accessibilityState={{ checked: isSelected, selected: isSelected }}
                style={[v2.row, { borderBottomColor: palette.separator }]}
                testID={`journey-${option.value}`}
              >
                <Mark icon={option.icon} />
                <View style={v2.rowText}>
                  <Text style={[typeV2.name, { color: palette.text }]}>{option.title}</Text>
                  <Text style={[typeV2.body, { color: palette.secondary }]}>{option.description}</Text>
                </View>
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={isSelected ? palette.accentText : palette.secondary}
                  testID={isSelected ? `journey-${option.value}-checked` : undefined}
                />
              </Tap>
            );
          })}
        </View>
      </ScrollView>
      <View style={v2.footer}>
        <PillButton title="Continue" size="lg" onPress={handleContinue} testID="journey-continue" />
      </View>
    </SafeAreaView>
  );
}

const v2 = StyleSheet.create({
  scroll: { paddingTop: 8, paddingBottom: 24 },
  headline: { paddingHorizontal: layoutV2.gutter, marginBottom: 20 },
  list: { borderTopWidth: layoutV2.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutV2.markGap,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: layoutV2.rowPad,
    borderBottomWidth: layoutV2.hairline,
  },
  rowText: { flex: 1, minWidth: 0 },
  footer: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 16 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
});
