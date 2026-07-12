import { FirestoreCustomPlan, FirestoreSavedPlan, FirestoreUser } from '../types/firestore';
import { CustomPlan, SavedPlan } from '../types';

export function customPlanToFirestore(
  plan: CustomPlan | null,
): FirestoreCustomPlan | null {
  if (!plan) return null;
  return {
    days: plan.days.map((pages) => ({ pages })),
    cycleStartDate: plan.cycleStartDate,
    direction: plan.direction,
  };
}

export function savedPlansToFirestore(
  plans: SavedPlan[],
): FirestoreSavedPlan[] {
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    days: plan.days.map((pages) => ({ pages })),
    direction: plan.direction,
    createdAt: plan.createdAt,
  }));
}

export function customPlanFromFirestore(
  plan: FirestoreCustomPlan | null | undefined,
): CustomPlan | null {
  if (!plan) return null;
  return {
    days: plan.days.map((day) => day.pages ?? []),
    cycleStartDate: plan.cycleStartDate,
    direction: plan.direction,
  };
}

export function savedPlansFromFirestore(
  plans: FirestoreSavedPlan[] | undefined,
): SavedPlan[] {
  return (plans ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    days: plan.days.map((day) => day.pages ?? []),
    direction: plan.direction,
    createdAt: plan.createdAt,
  }));
}

export function getScheduleAnchorDateFromFirestore(fsUser: FirestoreUser): string {
  return fsUser.scheduleAnchorDate ?? timestampToISOString(fsUser.createdAt);
}

// Helper to safely convert Firestore Timestamp-like values to ISO strings.
export function timestampToISOString(timestamp: any): string {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toISOString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000).toISOString();
  }
  if (typeof timestamp === 'string') {
    return timestamp;
  }
  return new Date().toISOString();
}
