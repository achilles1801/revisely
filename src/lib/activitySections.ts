// Activity's sections, arranged by the user (ACT-29; Majd, Nov 16 2026: "all these 'sections' on activity should be
// configurable so users can pick what they want to see and should be able to drag and move them around").
//
// Overview and Insights each keep an order and the sections hidden, per account on this phone
// (`@revisely_activity_sections:v1:<uid>`), never on the account: the user doc has a field allowlist, and a phone's
// own convenience doesn't need the server. The defaults are the layout as it was. Testers only for now
// (`activitySectionsEnabled`); everyone else gets the defaults and no Edit sections.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

export type ActivityTab = 'overview' | 'insights';

/** Overview under its month header (which stays first): the month's totals, the calendar, its key, the picked day. */
export const OVERVIEW_SECTIONS = ['totals', 'calendar', 'key', 'day'] as const;
/** Insights, as the tab shows them. */
export const INSIGHTS_SECTIONS = ['coverage', 'consistency', 'gaps', 'weak', 'recitation', 'memorization', 'pace'] as const;

export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];
export type InsightsSection = (typeof INSIGHTS_SECTIONS)[number];
export type SectionId<T extends ActivityTab> = T extends 'overview' ? OverviewSection : InsightsSection;

export const TAB_SECTIONS: { [T in ActivityTab]: readonly SectionId<T>[] } = {
  overview: OVERVIEW_SECTIONS,
  insights: INSIGHTS_SECTIONS,
};

/** Never hidden: without the calendar there is no day to pick. */
export const REQUIRED_SECTIONS: { [T in ActivityTab]: readonly SectionId<T>[] } = {
  overview: ['calendar'],
  insights: [],
};

/** The names the editor shows: each section's own title where it has one. */
export const SECTION_LABELS: { [T in ActivityTab]: Record<SectionId<T>, string> } = {
  overview: { totals: 'Month totals', calendar: 'Calendar', key: 'Key', day: 'Day summary' },
  insights: {
    coverage: 'Coverage',
    consistency: 'Consistency',
    gaps: 'Gaps',
    weak: 'Weak spots',
    recitation: 'Recitation',
    memorization: 'Memorization',
    pace: 'Pace',
  },
};

export interface TabLayout<T extends ActivityTab = ActivityTab> {
  /** Every section of the tab, in the order shown. */
  order: SectionId<T>[];
  /** The sections the user turned off. */
  hidden: SectionId<T>[];
}

export interface SectionsLayout {
  overview: TabLayout<'overview'>;
  insights: TabLayout<'insights'>;
}

export const DEFAULT_SECTIONS: SectionsLayout = {
  overview: { order: [...OVERVIEW_SECTIONS], hidden: [] },
  insights: { order: [...INSIGHTS_SECTIONS], hidden: [] },
};

export const activitySectionsKey = (uid: string) => `@revisely_activity_sections:v1:${uid}`;

/** Every signed-in account, from the mistake detection release (1.0.5; Majd, Nov 17 2026: Activity sections are in). */
export const activitySectionsEnabled = (user: { previewTester?: boolean } | null | undefined) => user != null;

/**
 * A tab's layout from whatever was stored: known sections only, each once, in the stored order; a section the
 * stored order lacks (one added since) goes back where the defaults put it, after the section it follows there.
 * Required sections are never hidden.
 */
export function cleanTab<T extends ActivityTab>(tab: T, raw: unknown): TabLayout<T> {
  const all = TAB_SECTIONS[tab] as readonly string[];
  const known = (v: unknown): v is SectionId<T> => typeof v === 'string' && all.includes(v);
  const obj = raw && typeof raw === 'object' ? (raw as { order?: unknown; hidden?: unknown }) : {};
  const order: SectionId<T>[] = [];
  for (const id of Array.isArray(obj.order) ? obj.order : []) if (known(id) && !order.includes(id)) order.push(id);
  for (let i = 0; i < all.length; i++) {
    const id = all[i] as SectionId<T>;
    if (order.includes(id)) continue;
    // After the nearest section before it in the defaults that is placed; first if none is.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = order.indexOf(all[j] as SectionId<T>);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  }
  const required = REQUIRED_SECTIONS[tab] as readonly string[];
  const hidden: SectionId<T>[] = [];
  for (const id of Array.isArray(obj.hidden) ? obj.hidden : []) {
    if (known(id) && !required.includes(id) && !hidden.includes(id)) hidden.push(id);
  }
  return { order, hidden };
}

export function cleanLayout(raw: unknown): SectionsLayout {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { overview: cleanTab('overview', obj.overview), insights: cleanTab('insights', obj.insights) };
}

/** Move one section of a tab from one place to another (the editor's drag, or VoiceOver's Move up and down). */
export function moveSection<T extends ActivityTab>(layout: TabLayout<T>, from: number, to: number): TabLayout<T> {
  const order = [...layout.order];
  if (from < 0 || from >= order.length) return layout;
  const target = Math.max(0, Math.min(order.length - 1, to));
  if (target === from) return layout;
  const [id] = order.splice(from, 1);
  order.splice(target, 0, id);
  return { ...layout, order };
}

/** Show or hide a section (a required one stays shown). */
export function setSectionShown<T extends ActivityTab>(tab: T, layout: TabLayout<T>, id: SectionId<T>, shown: boolean): TabLayout<T> {
  if ((REQUIRED_SECTIONS[tab] as readonly string[]).includes(id)) return layout;
  const without = layout.hidden.filter((h) => h !== id);
  return { ...layout, hidden: shown ? without : [...without, id] };
}

/** The sections to draw, in order: shown, and those the account has (`has`; a section it can't have keeps its slot). */
export function sectionsToShow<T extends ActivityTab>(layout: TabLayout<T>, has: (id: SectionId<T>) => boolean = () => true): SectionId<T>[] {
  return layout.order.filter((id) => !layout.hidden.includes(id) && has(id));
}

export function isDefaultTab<T extends ActivityTab>(tab: T, layout: TabLayout<T>): boolean {
  const all = TAB_SECTIONS[tab];
  return layout.hidden.length === 0 && layout.order.length === all.length && layout.order.every((id, i) => id === all[i]);
}

// ── The store: one account's layout, live ───────────────────────────────────────────────────────────────

let owner: string | null = null;
let current: SectionsLayout = DEFAULT_SECTIONS;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Load the account's layout (the defaults until it arrives, for a new account, or signed out). */
export async function loadActivitySections(uid: string | null | undefined): Promise<SectionsLayout> {
  if (!uid) {
    owner = null;
    current = DEFAULT_SECTIONS;
    notify();
    return current;
  }
  if (owner !== uid) {
    owner = uid;
    current = DEFAULT_SECTIONS;
    notify();
  }
  try {
    const raw = await AsyncStorage.getItem(activitySectionsKey(uid));
    if (owner !== uid) return current;
    current = cleanLayout(raw ? JSON.parse(raw) : null);
  } catch (err) {
    logger.warn('Activity sections unreadable', err);
    current = DEFAULT_SECTIONS;
  }
  notify();
  return current;
}

/** Change one tab's layout and keep it for the account. */
export function updateActivitySections<T extends ActivityTab>(tab: T, change: (layout: TabLayout<T>) => TabLayout<T>) {
  const next = cleanTab(tab, change(current[tab] as TabLayout<T>));
  current = { ...current, [tab]: next };
  notify();
  if (!owner) return;
  AsyncStorage.setItem(activitySectionsKey(owner), JSON.stringify(current)).catch((err) =>
    logger.warn('Could not save the Activity sections', err),
  );
}

export function getActivitySections(): SectionsLayout {
  return current;
}

/**
 * The signed-in account's layout, live: the defaults for an account without the feature (`enabled` false), so the
 * screen is as it was for them whatever this phone holds.
 */
export function useActivitySections(uid: string | null | undefined, enabled = true): SectionsLayout {
  useEffect(() => {
    if (enabled) loadActivitySections(uid);
  }, [uid, enabled]);
  const layout = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  return enabled && owner === uid ? layout : DEFAULT_SECTIONS;
}
