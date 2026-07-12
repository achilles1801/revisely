import { CustomPlan, SavedPlan } from '../types';

type Direction = CustomPlan['direction'];

export function dateToLocalISODay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function createCustomPlanFromDraft(
  days: number[][],
  direction: Direction,
  today: Date = new Date(),
): CustomPlan {
  return {
    days: days.map((day) => [...day]),
    cycleStartDate: dateToLocalISODay(today),
    direction,
  };
}

export function createCustomPlanFromSavedPlan(
  plan: SavedPlan,
  today: Date = new Date(),
): CustomPlan {
  return createCustomPlanFromDraft(plan.days, plan.direction, today);
}
