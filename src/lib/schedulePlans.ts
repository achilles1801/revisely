import { CustomPlan, SavedPlan } from '../types';

type Direction = CustomPlan['direction'];

export function dateToLocalISODay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** What the Schedule screen calls a custom plan (SCHED-7): its name, else "Custom plan". */
export function customPlanTitle(name: string | undefined): string {
  return name?.trim() || 'Custom plan';
}

export function createCustomPlanFromDraft(
  days: number[][],
  direction: Direction,
  today: Date = new Date(),
  /** The plan's name, if it has one (SCHED-7). */
  name?: string,
): CustomPlan {
  const title = name?.trim();
  return {
    days: days.map((day) => [...day]),
    cycleStartDate: dateToLocalISODay(today),
    direction,
    ...(title ? { name: title } : {}),
  };
}

export function createCustomPlanFromSavedPlan(
  plan: SavedPlan,
  today: Date = new Date(),
): CustomPlan {
  return createCustomPlanFromDraft(plan.days, plan.direction, today, plan.name);
}
