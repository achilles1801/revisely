import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { PlanSheet } from './PlanSheet';
import { GroupedRow, GroupedSection } from './Grouped';
import { PillButton } from '../v2/PillButton';
import { IconButton } from '../v2/TopBar';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import type { SavedPlan } from '../../types';
import { t } from '../../i18n';

/**
 * Edit schedule → More → Saved plans (SCHED-7, SCHED-8; the audit's mock B4): each saved plan with Load (it shows
 * in the editor first; nothing changes until Save) and a bin, then "Save this schedule as a copy…".
 */
export const SavedPlansSheet = forwardRef<
  BottomSheetModal,
  {
    plans: SavedPlan[];
    canSaveCopy: boolean;
    onLoad: (plan: SavedPlan) => void;
    onDelete: (plan: SavedPlan) => void;
    onSaveCopy: () => void;
  }
>(function SavedPlansSheet({ plans, canSaveCopy, onLoad, onDelete, onSaveCopy }, ref) {
  const { palette } = useTheme();
  const dismiss = () => (ref as React.RefObject<BottomSheetModal | null>)?.current?.dismiss();
  return (
    <PlanSheet ref={ref} title={t('plan.saved.title')} rightLabel={t('common.done')} onRight={dismiss}>
      <View testID="saved-plans-sheet">
        {plans.length === 0 ? (
          <Text style={[typeV2.meta, styles.empty, { color: palette.secondary }]}>{t('plan.saved.none')}</Text>
        ) : (
          <GroupedSection divider={false} footer={t('plan.saved.footer')}>
            {plans.map((plan) => (
              <GroupedRow
                key={plan.id}
                title={plan.name}
                subtitle={t(plan.direction === 'reverse' ? 'plan.saved.cycleReverse' : 'plan.saved.cycle', { count: plan.days.length })}
                trailing={
                  <View style={styles.actions}>
                    <PillButton
                      title={t('plan.saved.load')}
                      size="sm"
                      variant="outline"
                      onPress={() => {
                        dismiss();
                        onLoad(plan);
                      }}
                      accessibilityLabel={t('plan.saved.loadLabel', { name: plan.name })}
                      testID={`saved-plan-load-${plan.id}`}
                    />
                    <IconButton
                      icon="trash-outline"
                      size={22}
                      color={palette.secondary}
                      onPress={() => onDelete(plan)}
                      label={t('plan.saved.deleteLabel', { name: plan.name })}
                      testID={`saved-plan-delete-${plan.id}`}
                    />
                  </View>
                }
                testID={`saved-plan-${plan.id}`}
              />
            ))}
          </GroupedSection>
        )}
        <GroupedSection divider={false}>
          <GroupedRow
            title={t('plan.saved.saveCopy')}
            icon="bookmark-outline"
            onPress={() => {
              dismiss();
              onSaveCopy();
            }}
            disabled={!canSaveCopy}
            testID="plan-save-current"
          />
        </GroupedSection>
      </View>
    </PlanSheet>
  );
});

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 4 },
});
