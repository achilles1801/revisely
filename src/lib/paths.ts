// Which path an account is on (PATH-1; Majd, Nov 28 2026: "essentially it SHOULD be beginner path, middle path (what we
// have now), and hafz path"). Setup's first question picks it, one answer a path:
//
//   "None yet, or a few surahs"  → 'beginner'  its own setup and Home (BEGIN-*), Revisely Dev (lib/release/beginnerPath)
//   "Part of it"                 → 'middle'    today's app, exactly as before
//   "All of it"                  → 'middle'    today's app for now; the hafiz path (revision only, memorizing out of the
//                                              way) is meant to slot in here later (his "p2")
//
// Only that first answer ever sets a path: the user document's `path` is written by setup's last question and by nothing
// else, so an account set up before the beginner path, or with today's answers, has none and stays on today's path. Every
// screen that differs by path asks here, never the field itself, so turning the switch off puts everyone on today's path.

import type { RevisionPathField, User } from '../types';
import { beginnerPathEnabled } from './release/beginnerPath';

export type RevisionPath = 'beginner' | 'middle' | 'hafiz';

/** The account's path: 'beginner' only when setup chose it and the beginner path is on; else today's ('middle'). */
export function pathOf(user: Pick<User, 'path'> | null | undefined): RevisionPath {
  if (user?.path === 'beginner' && beginnerPathEnabled()) return 'beginner';
  // 'hafiz' isn't built yet: such an account (none can be made) gets today's app.
  return 'middle';
}

export const isBeginner = (user: Pick<User, 'path'> | null | undefined): boolean => pathOf(user) === 'beginner';

/**
 * What setup's last question writes for the path (ReminderScreen): the path chosen, or, setting up again on today's path
 * after a beginner's setup, null to clear it. An account that never had a path gets nothing, so its document is written
 * exactly as before.
 */
export function pathFieldForSetup(
  chosen: RevisionPathField | undefined,
  user: Pick<User, 'path'> | null | undefined,
): { path?: RevisionPathField | null } {
  if (chosen) return { path: chosen };
  return user?.path ? { path: null } : {};
}
