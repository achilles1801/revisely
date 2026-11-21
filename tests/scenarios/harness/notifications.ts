// expo-notifications for scenarios: the phone's notification permission and its
// pending local notifications. By default permission is refused and nothing is
// pending, as before this stand-in existed; a scenario that checks reminders
// allows them (allowNotifications) and reads what is pending
// (pendingNotifications). The state lives on globalThis so it survives
// jest.resetModules: notifications scheduled before a cold start are still
// pending after it, as on a phone. harness/afterEnv resets it after each test.
//
// Only what the app calls is modelled: permission, scheduling with a date
// trigger, listing, cancelling. A notification whose date has passed has been
// shown: it is no longer pending (iOS and Android list only those still to come).

type Status = 'granted' | 'denied' | 'undetermined';

export interface Scheduled {
  identifier: string;
  content: { title?: string; body?: string; sound?: boolean; interruptionLevel?: string; data?: unknown };
  trigger: { type?: string; date?: Date | number; channelId?: string } | null;
}

interface NotificationState {
  status: Status;
  scheduled: Map<string, Scheduled>;
}

const g = globalThis as unknown as { __scenarioNotifications?: NotificationState };
const state: NotificationState = (g.__scenarioNotifications ??= { status: 'denied', scheduled: new Map() });

/** The phone allows notifications (as if the user said yes to iOS's prompt). */
export function allowNotifications(): void {
  state.status = 'granted';
}

/** Back to a phone that refuses them, with nothing pending (after each test). */
export function resetNotifications(): void {
  state.status = 'denied';
  state.scheduled.clear();
}

const when = (n: Scheduled) => {
  const d = n.trigger?.date;
  return d instanceof Date ? d.getTime() : typeof d === 'number' ? d : Number.POSITIVE_INFINITY;
};

/** What is still to come, soonest first (Date is the scenario clock). */
export function pendingNotifications(): Scheduled[] {
  const now = Date.now();
  return [...state.scheduled.values()].filter((n) => when(n) > now).sort((a, b) => when(a) - when(b));
}

const permission = () => ({
  status: state.status,
  granted: state.status === 'granted',
  canAskAgain: state.status === 'undetermined',
  expires: 'never',
});

let counter = 0;
const api: Record<string, unknown> = {
  __esModule: true,
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date', WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5, LOW: 2 },
  getPermissionsAsync: async () => permission(),
  requestPermissionsAsync: async () => permission(),
  scheduleNotificationAsync: async (request: Partial<Scheduled>) => {
    const identifier = request.identifier ?? `scenario-${++counter}`;
    state.scheduled.set(identifier, {
      identifier,
      content: request.content ?? {},
      trigger: request.trigger ?? null,
    });
    return identifier;
  },
  getAllScheduledNotificationsAsync: async () => pendingNotifications().map((n) => ({ ...n })),
  cancelScheduledNotificationAsync: async (id: string) => {
    state.scheduled.delete(id);
  },
  cancelAllScheduledNotificationsAsync: async () => {
    state.scheduled.clear();
  },
  getPresentedNotificationsAsync: async () => [],
  getExpoPushTokenAsync: async () => ({ data: 'scenario' }),
  allowNotifications,
  resetNotifications,
  pendingNotifications,
};

// Anything else the app calls (channels, listeners, the handler) does nothing.
module.exports = new Proxy(api, {
  get: (t, k: string) =>
    k in t ? t[k] : k.startsWith('add') && k.endsWith('Listener') ? () => ({ remove: () => undefined }) : async () => undefined,
});
