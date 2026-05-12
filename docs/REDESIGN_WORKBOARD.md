# Revisley Visual Redesign — Workboard

> **For any agent picking this up mid-flight:** Read this entire file first. It contains all locked design decisions, the token system, and per-task status. Update the status checkboxes as you complete items. Don't re-litigate decisions in the "Locked decisions" section unless the user explicitly asks.

## Goal

Make the app feel like a modern, minimalist 2026 mobile product. The user described the current state as "ugly," "boring colors," "doesn't look like a modern minimalistic app." Reference apps for the feel: Linear, Things 3, Headspace, Apple Health, Notion.

## Locked decisions

1. **Palette**: Option A — "Mihrab" (warm earth + deep jade). See token table below.
2. **Body font**: Inter, loaded via `expo-font`. Display font stays Georgia (right for a Quran app).
3. **Tab bar**: Reduced from 4 → 3 tabs (Home, Insights, Progress). Settings moves to a gear icon in the Dashboard header → pushes to a stack screen.
4. **Bottom sheets**: Use `@gorhom/bottom-sheet` library for `EditSessionModal`, `BulkActionsModal`, and similar.
5. **Implementation style**: One feature branch (no PRs split out). User wants the full thing done.

## Design tokens (the new system)

### Colors — Option A "Mihrab"

```ts
// LIGHT
bg:           '#FBF8F3'   // warm parchment
bgAlt:        '#F4EFE6'   // oatmeal
surface:      '#FFFFFF'   // elevated cards (with shadow)
textPrimary:  '#1A1A1A'
textSecondary:'#5C5147'
textMuted:    '#8B8275'
border:       '#E8E1D4'
accent:       '#0E6B5A'   // jade — primary CTA, links, highlights
accentSoft:   '#E5F0EC'   // jade tinted bg for chips/badges
gold:         '#B8893E'   // streak / special highlights only
success:      '#0E6B5A'   // same as accent — unify
warning:      '#C0833D'
error:        '#B23B3B'
warningBg:    '#FBEFD9'
errorBg:      '#FBE5E5'
successBg:    '#E5F0EC'

// DARK
bg:           '#0F1410'   // deep ink
bgAlt:        '#1A201B'   // forest ink
surface:      '#222B23'
textPrimary:  '#F5F1EA'
textSecondary:'#A8A095'
textMuted:    '#6B6359'
border:       '#2D332E'
accent:       '#34A88F'
accentSoft:   '#0E2A24'
gold:         '#D4A968'
success:      '#34A88F'
warning:      '#E0A158'
error:        '#E07070'
warningBg:    '#3A2A12'
errorBg:      '#3A1A1A'
successBg:    '#0E2A24'
```

### Radius
```ts
xs: 6, sm: 10, md: 14, lg: 20, full: 999
```

### Spacing (densified — 10 steps)
```ts
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

### Shadows
```ts
sm: subtle 2px lift (cards on light bg)
md: 4px / 12px blur, 6% opacity (elevated cards)
lg: 10px / 28px blur, 12% opacity (modals/sheets)
```

### Typography
- Body font: **Inter** (loaded via `expo-font`)
- Display font: **Georgia** (kept)
- Add weight variation to displays (currently flat 300/400 — need 600 for emphasis)
- `label` size: 11pt → 12pt

### Motion + haptics
- All interactive elements wrapped in `<PressableScale>` (scale 0.98 on press + Light haptic)
- `Medium` haptic on primary CTAs
- `Success` haptic on session complete
- Screen transitions via native stack animations
- Animate progress bar fill, expand/collapse, modal slide

## Tab bar refactor

Remove Settings from `MainNavigator.tsx` tabs. Gear icon in `DashboardScreen` header → `navigation.navigate('Settings')`. Remaining tabs use Ionicons:
- Home → `home-outline` / `home` (active)
- Insights → `analytics-outline` / `analytics`
- Progress → `bookmarks-outline` / `bookmarks`

---

## Workboard — Status

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

### Phase 1 — Foundation (design tokens) ✅
- [x] Install `expo-haptics`, `@gorhom/bottom-sheet`, `@expo-google-fonts/inter`
- [x] Rewrite `src/theme/colors.ts` with Option A palette
- [x] Create `src/theme/radius.ts`
- [x] Update `src/theme/spacing.ts` to 10-step scale
- [x] Create `src/theme/shadows.ts`
- [x] Update `src/theme/typography.ts` to use Inter + new weight variants
- [x] Load Inter fonts in `App.tsx` via `useFonts`

### Phase 2 — Atomic components ✅
- [x] `PressableScale.tsx` (scale + haptic wrapper)
- [x] `Card.tsx` — variants (flat / outlined / elevated)
- [x] `Button.tsx` — 10px radius, haptic, loading, destructive variant
- [x] `StatBox.tsx` — bgAlt fill, no border
- [x] `ProgressBar.tsx` — accent + animated fill
- [x] `Header.tsx` — added rightSlot
- [x] `WeaknessRating.tsx` — refreshed sheet, semantic tones, haptic on save
- [x] `JuzGrid.tsx` — accent states, haptic
- [x] `PageList.tsx` — animated checkbox, bookmark icon
- [x] `Stepper.tsx` (NEW) — onboarding dot stepper

### Phase 3 — Navigation ✅
- [x] Settings removed from tab bar; now reachable via gear icon on Dashboard
- [x] Tabs reduced to 3 (Home, Insights, Progress); Ionicons replace Unicode
- [x] EditJuz registered in HomeStack (was unreachable)

### Phase 4 — Onboarding screens ✅
- [x] WelcomeScreen — Reanimated fade-in sequence, ornament, larger hierarchy
- [x] JourneySelect — accent border on selection, icon per option, dot stepper
- [x] JuzSelection — radii standardized, LayoutAnimation expand, sticky CTA
- [x] NaturalLanguageInput — modern chat bubbles, mic pulse + ripple, focus polish
- [x] Schedule — circular day pills, accent slider, mode cards with icons

### Phase 5 — Main screens ✅
- [x] Dashboard — hero today card, killed card-on-card, settings gear, grouped sessions
- [x] Settings — iOS grouped-list style, segmented controls, polished sheets
- [x] History — circular heatmap with intensity, sheet detail view, empty state
- [x] ActiveRevision — pill header buttons, accent progress, semantic CTA copy
- [x] Algorithm — semantic colors (no hardcoded hex), PressableScale rows, full-radii
- [x] Progress — accent active states, removed toggle shadows, animated expand
- [x] EditJuz — bgDark→accent swap (deeper rewrite deferred, screen unreachable)

### Phase 6 — Modals → Bottom sheets ✅
- [x] App.tsx wrapped in `BottomSheetModalProvider`
- [x] BulkActionsModal → `@gorhom/bottom-sheet` (snap points, backdrop)
- [x] EditSessionModal → polished full-screen Modal (kept fullscreen for QuranPageViewer)
- [x] WeaknessModal → polished sheet pattern (drag handle, semantic tones)

### Phase 7 — Final pass ✅
- [x] `npx tsc --noEmit` clean
- [x] `npm test` — 40/40 pass
- [x] `npx expo export --platform ios` builds clean (~6 MB bundle)

## Final state

All work complete. Branch is `main` with all changes uncommitted. To verify:
```bash
npx tsc --noEmit && npm test && npx expo export --platform ios
```

Known follow-ups (not blocking):
- `bgDark` token still exists in colors.ts as a compat shim. Safe to remove once all references are gone.
- EditJuzScreen got a minimal palette update — is unreachable from UI; do a deeper rewrite when wiring it up.
- The legacy `successBg` / `warningBg` colors got brand-new values; if any prior screen relied on the old amber tones, expect color drift.

---

## Notes for the next agent
- **Don't change firestore.rules, functions/, or test setup.** All redesign work is in `src/`, `App.tsx`, and `app.config.js` (font registration only if needed).
- **Reanimated v4 + new arch** is what's installed. Use the Reanimated worklet API, not Animated.
- **Test command:** `npm test` (Jest) — the existing 40 tests should keep passing. If a UI change breaks a snapshot, update it.
- **Don't add CSS-in-JS libraries** (styled-components, etc.). Stay with `StyleSheet.create` per the existing pattern.
- **Tab bar order**: Home, Insights, Progress (3 tabs). Settings is now a stack screen reached from Dashboard.
