# Revisley — Implementation Task Board

Live spec for the in-progress redesign of Revisley's onboarding, revision flow, and smart-tracking feature. Update this file as phases ship.

---

## Context

Revisley is a Quran revision app for **huffaz** (people who have memorized portions or all of the Quran). The app is currently in development — there are no production users, so we can rip out deprecated fields and concepts directly without migration shims.

### Core product decisions

- **Two onboarding paths only**: `in_progress` and `complete`. No "Beginning."
- **App is directive**: the schedule tells the user what to revise on a given day. The user either marks a page done or skips it — they cannot freely pick what to revise from the revision screen.
- **Smart Tracking is opt-in**: default revision experience is a plain check-off list with no ratings, no algorithm-driven prioritization, no Insights tab. Smart Tracking unlocks page ratings + Insights.
- **Algorithm signal is consistency, not calendar time**: a page's urgency is driven by how many scheduled revisions the user has missed for that page, not by raw days since last revised. User-reported strength rating acts as a multiplier on top of consistency debt.
- **Insights tab populates at 5+ submitted sessions** — under that, show a friendly "keep going" message.
- **Surah Al-Fatihah (page 1) is pre-selected** on the JuzSelection screen for every onboarding user (every Muslim knows it). The user cannot complete onboarding with 0 pages selected.
- **Default plan**: sequential, every day active, juz 1 → juz 30, looping at the end of the khatam cycle.
- **Plan editor (Phase 7)**: juz-level edits, one khatam cycle ahead, direction toggle (1→30 or 30→1).
- **Sessions reset at midnight local time** — disclosed once during onboarding.

### Single-name-per-concept policy (enforced in Phase 8)

| Concept | Canonical name | Notes |
|---|---|---|
| The Insights tab | `Insights` | Currently routed as `Algorithm`. Rename in Phase 8. |
| Smart Tracking | `smartTrackingEnabled` (field), `Smart Tracking` (UI) | One name everywhere. |
| Preview-seen flag | `hasSeenSmartTrackingPreview` | |
| Page strength rating | `weaknessRating` (data field, legacy), UI uses "Strength" + Very weak/Weak/Moderate/Strong/Very strong | Data field stays for now; UI terminology is fixed. |
| Schedule / Plan | `plan` (singular, canonical) | Avoid mixing "schedule," "cycle," "rotation," etc. in UI. |
| Khatam cycle length | `khatamCycleDays` | One full pass through the user's memorized set. |
| Active day | derived from plan | Not a separate setting. |

---

## Phase status

| Phase | Status |
|---|---|
| 0 — Onboarding reset bug fix | ✅ DONE |
| 1 — Data model + immediate consumers | ✅ DONE |
| 2 — Onboarding rewrite | ✅ DONE |
| 3 — Revision session default behavior | ✅ DONE |
| 4 — Tab visibility + glow | ✅ DONE |
| 5 — Sandbox preview tour | ✅ DONE |
| 6 — Schedule-consistency-aware algorithm | ✅ DONE |
| 7 — Plan editor | ✅ DONE |
| 8 — Cleanup & naming consistency | ✅ DONE |

---

## Phase 0 — Onboarding reset bug fix ✅

**Done in commit:** (pre-task-board, in current working tree)

Fixed `resetOnboarding` so that replaying onboarding actually wipes prior state. Previously it only flipped `onboardingComplete: false`, leaving page-memorization state from the previous run intact — which is why selecting "Complete" then replaying as "Beginning" showed everything pre-memorized.

**What changed:**
- [`AppContext.tsx`](src/context/AppContext.tsx) `resetOnboarding` now also deletes all sessions, resets every page to `not_memorized` with default fields, zeroes `totalMemorizedPages`/`streak`/`lastRevisionDate`, and mirrors the wipe locally.
- [`firestore.ts`](src/types/firestore.ts) `UpdateUserInput` extended to accept `totalMemorizedPages`, `streak`, `lastRevisionDate`.
- [`firestoreService.ts`](src/services/firestoreService.ts) `updateUser` forwards the new fields.

---

## Phase 1 — Data model + immediate consumers

**Goal:** Replace the `mode` concept end-to-end with `smartTrackingEnabled` and `hasSeenSmartTrackingPreview`. No new UI yet — just rewire what already exists.

**Scope:**
- Delete `RevisionMode` type and `user.mode` field everywhere
- Add `smartTrackingEnabled: boolean` (default `false`)
- Add `hasSeenSmartTrackingPreview: boolean` (default `false`)
- Update Firestore allowlist and types
- Update consumers: AlgorithmScreen, SettingsScreen, ScheduleScreen (remove mode picker — overlaps with Phase 2)

**Files:**
- `src/types/index.ts`
- `src/types/firestore.ts`
- `src/context/AppContext.tsx`
- `src/services/firestoreService.ts`
- `firestore.rules`
- `src/screens/main/AlgorithmScreen.tsx`
- `src/screens/main/SettingsScreen.tsx`
- `src/screens/onboarding/ScheduleScreen.tsx`

**Acceptance:**
- `git grep "RevisionMode\|user\.mode\|'weighted'\|'sequential'"` returns nothing
- Typecheck and existing tests pass
- App still launches and the existing UIs still render (just without the mode toggle UI)

---

## Phase 2 — Onboarding rewrite

**Goal:** Drop "Beginning," pre-select Fatihah, simplify the schedule step, ensure both paths flow consistently.

**Scope:**
- `JourneyStage` becomes `'in_progress' | 'complete'`
- JourneySelectScreen: 2 options instead of 3, copy reframed for huffaz audience
- JuzSelectionScreen: Fatihah (page 1) pre-selected on entry for both paths; Continue button disabled if 0 pages selected; Complete path pre-selects everything via the existing effect
- ScheduleScreen: remove weekly active-days picker, remove mode picker, replace with pages-per-day + khatam-cycle-days. Add midnight-reset disclosure line. Update Stepper counts.
- Remove `'beginning'` branches in `parseMemorization.ts` if any

**Files:**
- `src/navigation/OnboardingNavigator.tsx`
- `src/screens/onboarding/JourneySelectScreen.tsx`
- `src/screens/onboarding/JuzSelectionScreen.tsx`
- `src/screens/onboarding/ScheduleScreen.tsx`
- `src/screens/onboarding/NaturalLanguageInputScreen.tsx` (still gated by `in_progress` — keep, just verify references)
- `src/lib/parseMemorization.ts` (audit only)

**Acceptance:**
- Onboarding has 3 steps for both paths (JourneySelect → JuzSelection → Schedule)
- Continue disabled in JuzSelection at 0 pages, enabled at 1+
- Schedule screen has no mode picker, no weekly days picker
- Fatihah is checked by default on JuzSelection entry
- Both paths complete successfully end-to-end in dev

---

## Phase 3 — Revision session default behavior

**Goal:** Make the default revision flow a plain check-off list. No ratings unless Smart Tracking is on.

**Scope:**
- `ActiveRevisionScreen`: gate the weakness rating UI (`WeaknessModal` triggers, rating chips, rating-related affordances) behind `user.smartTrackingEnabled`
- Session submission still writes `pagesRevised` and `pagesSkipped` for everyone — only `weaknessUpdates` is gated
- Keep `WeaknessRating` component intact for when Smart Tracking is on

**Files:**
- `src/screens/revision/ActiveRevisionScreen.tsx`

**Acceptance:**
- With Smart Tracking off: revision session is a checklist — tap to mark done, tap to skip, submit
- With Smart Tracking on: existing rating behavior unchanged
- No regressions in session submission

---

## Phase 4 — Tab visibility + glow

**Goal:** Insights tab is glowing for new users, hidden if they decline the preview, visible if they enable Smart Tracking.

**Tab matrix:**

| `smartTrackingEnabled` | `hasSeenSmartTrackingPreview` | Tab bar |
|---|---|---|
| `false` | `false` | Home, **Insights (glow)**, Progress |
| `true` | `*` | Home, Insights, Progress |
| `false` | `true` | Home, Progress (2 tabs) |

**Scope:**
- `MainNavigator`: conditionally render the Insights tab per the matrix
- `LiquidGlassTabBar`: support a glow state for a single tab
- Rename the route from `Algorithm` to `Insights` (the UI already says "Insights") — keeps internals consistent with what the user sees. (Could defer this to Phase 8, but it lands cleanly here.)

**Files:**
- `src/navigation/MainNavigator.tsx`
- `src/components/LiquidGlassTabBar.tsx`

**Acceptance:**
- Tab visibility matches the matrix in dev
- Glow animates subtly without being obnoxious
- Tab rename doesn't break any deep links or refs

---

## Phase 5 — Sandbox preview tour

**Goal:** Tapping the glowing Insights tab opens a guided sandboxed preview that ends with an Enable / Not now decision.

**Scope:**
- Tapping the glowing Insights tab routes to a sandbox preview flow (not the real Insights screen)
- Sandbox uses the user's actually-selected memorized pages (Fatihah minimum) but mocked metrics
- Coach marks step the user through:
  1. The revision session screen with a rating UI live — "tap a page to rate it"
  2. After rating + save → "see how it landed in your Insights"
  3. Insights screen → "this is Today's Focus" → tap Open → page preview
  4. Browse list → strength filter
- End sheet: "Enable Smart Tracking?" with **Enable** and **Not now** buttons
  - Enable → set `smartTrackingEnabled = true`, `hasSeenSmartTrackingPreview = true`, exit to Dashboard with toast confirmation
  - Not now → set `hasSeenSmartTrackingPreview = true`, show final coach mark pointing to where the Smart Tracking toggle lives in Settings, exit to Dashboard
- Backing out mid-preview does NOT set `hasSeenSmartTrackingPreview = true` — the glow persists until the user makes an explicit choice

**Files:**
- New `src/screens/preview/SmartTrackingPreviewScreen.tsx` (or a small stack of sandboxed screens)
- New `src/components/CoachMark.tsx`
- `src/navigation/MainNavigator.tsx` — wire the glowing tab to the preview when not yet seen

**Acceptance:**
- Tour runs end-to-end in dev with a fresh account where only Fatihah is selected
- Both Enable and Not now paths set the correct flags and the tab updates accordingly
- Mid-preview back-out leaves the glow on for next attempt

---

## Phase 6 — Schedule-consistency-aware algorithm

**Goal:** Replace calendar-based urgency with consistency-debt urgency. Insights tab requires 5+ submitted sessions to populate.

**Scope:**
- New helper `getPagesScheduledForDate(user, date, memorizedPages)` — resolves the default sequential plan: starting from `currentKhatamPage`, advances by `pagesPerDay` each calendar day, wraps at end of memorized set
- New helper `getMissedScheduledRevisions(page, user, sessions)` — counts consecutive scheduled-but-not-completed days for the page since its last completed revision
- Rewrite `calculatePageUrgency`:
  - **Base** = function of consistency debt (consecutive missed scheduled revisions)
  - **Strength multiplier** = derived from `weaknessRating` (1.0 for neutral when unrated, higher for weak, lower for strong) — only meaningful when Smart Tracking has been collecting ratings, but mathematically neutral otherwise
  - **Recency multiplier** = keep current behavior for newly memorized pages
- Drop `dangerThresholdDays` (or repurpose as `missedRevisionThreshold` if a configurable cutoff is needed)
- AlgorithmScreen: gate the populated state behind `submittedSessionCount >= 5`. Below threshold show a friendly message ("Your Insights will start showing meaningful patterns after 5 completed sessions. You have X so far — keep going.")
- Update `src/lib/__tests__/algorithm.test.ts` with new test cases

**Files:**
- `src/lib/algorithm.ts`
- `src/lib/__tests__/algorithm.test.ts`
- `src/screens/main/AlgorithmScreen.tsx`
- `src/types/firestore.ts`, `firestore.rules` (if threshold field changes)
- `src/context/AppContext.tsx`

**Acceptance:**
- Test cases: page revised every scheduled day = low urgency; page with 3 missed scheduled days = high urgency; rating multiplier increases urgency proportionally
- Below 5 sessions: tab shows message, no rows
- At 5+ sessions: tab shows the populated view

---

## Phase 7 — Plan editor (post-onboarding)

**Goal:** Editable khatam cycle reachable from Dashboard. Juz-level granularity, current cycle only.

**Scope:**
- New `PlanEditScreen` — shows the current khatam cycle as a list of days, each with assigned juz
- Tap a day to swap which juz is assigned
- Reorder days (drag handle)
- Mark a day as off (skipped from the cycle)
- Direction toggle: `1→30` or `30→1` (default per user choice)
- Reachable via an edit affordance on the Dashboard (icon near today's assignment)
- Persist a custom plan that overrides the default sequential resolver
- Custom plan covers one khatam cycle ahead; beyond that the plan loops automatically

**Files:**
- New `src/screens/main/PlanEditScreen.tsx`
- `src/navigation/MainNavigator.tsx` — add to Home stack
- `src/screens/main/DashboardScreen.tsx` — add entry affordance
- `src/services/firestoreService.ts` — persistence for custom plan (extend user doc or new subcollection)
- `src/types/firestore.ts` — types for custom plan
- `firestore.rules` — allow the new field/collection
- `src/lib/algorithm.ts` — `getPagesScheduledForDate` consults custom plan when present

**Acceptance:**
- User can reorder, swap, and mark off days within the current cycle
- Direction toggle flips the default ordering
- Algorithm respects custom plan for consistency tracking
- After current cycle ends, plan loops cleanly

---

## Phase 8 — Cleanup & naming consistency

**Goal:** Production-clean codebase. One canonical name per concept. No dead branches, no stale references.

**Scope:**
- Naming audit per the table in the Context section above
- `git grep` for old terms and replace systematically:
  - `RevisionMode`, `user.mode`, `'weighted'`, `'sequential'` (should be gone after Phase 1, verify)
  - `'beginning'`, `JourneyStage === 'beginning'` (should be gone after Phase 2, verify)
  - `dangerThresholdDays` references (should be gone or renamed after Phase 6, verify)
  - "Algorithm" tab route — if not renamed in Phase 4, rename now to `Insights`
  - Mix of "schedule" / "plan" / "cycle" / "rotation" in UI copy — unify
  - User-facing rating labels use the canonical strength scale (Very weak / Weak / Moderate / Strong / Very strong)
- Dead code removal:
  - Orphaned components from removed flows
  - Unused imports across all files (let TS/lint catch)
  - Dead branches in conditionals
- Stale comments and TODOs that reference removed concepts
- Firestore rules: remove fields no longer written from any code path
- TypeScript `any` audit: tighten where reasonable
- Run `npx tsc --noEmit`, lint, and existing test suite — all green
- Manual walkthrough in the dev server: complete onboarding both paths, run a revision session both with and without Smart Tracking, enable/disable Smart Tracking, edit a plan, verify Insights gating

**Files:** every directory under `src/`, plus `firestore.rules`

**Acceptance:**
- `git grep` for any deprecated term returns nothing
- Typecheck, lint, test suite all pass
- Manual walkthrough produces no surprises

---

## Cross-cutting notes

- Stop at the end of each phase for review before continuing
- All phases must leave the app in a launchable state
- Algorithm changes (Phase 6) require new tests; UI changes don't unless they expose business logic
- No production users → no migration shims required
