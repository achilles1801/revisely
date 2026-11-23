# Strings (src/i18n)

Revisely is getting a second language (Arabic). The groundwork lands first, in English, with nothing
visible changing: every piece of UI text moves out of the code into `src/i18n/en/`, folder by folder.
The plan and its steps: `~/Documents/revisely-ideas/approved/2026-11-15-growth-app-in-arabic-study.md`.

## Using a string

```ts
import { t } from '../../i18n';

t('updates.ready.title');                         // "A new update is ready"
t('updates.store.body', { version, store });      // "Revisely 1.0.4 is on the App Store."
```

- The English lives in `src/i18n/en/<folder>.ts`, one file per folder of the app (`components/updates`
  and `lib/updates` share `updates.ts`), listed in `en/index.ts`. Keys are typed: a key that doesn't
  exist, or a `{{value}}` left out, fails the typecheck.
- `t()` is a plain function, for components and `lib/` alike. Call it where the text is used, never in
  a module-level constant: the language is set at launch, and a constant would keep the first one.
- Tests, scenarios and E2E builds always run in English (`pinnedToEnglish` in `language.ts`), so text
  queries and Maestro matchers keep working.

## Writing a string

- **Whole sentences, with values in them:** `'Get version {{minimum}} or later from {{store}}'`, never
  `'Get version ' + minimum + ' or later'`. Word order differs between languages.
- **Plurals:** two keys, `pages_one: '{{count}} page'` and `pages_other: '{{count}} pages'`, used as
  `t('x.pages', { count })`. Not `n === 1 ? 'page' : 'pages'`: Arabic has six forms.
- **No › or ‹ in a string.** They must point the other way in Arabic: the code adds `chevron()` or
  `backChevron()` (`src/i18n/direction.ts`) after the text, joined with a no-break space as before.
- **Keys** say what the text is, in camelCase, grouped by screen or part: `updates.required.title`.
  A word used in two places with two meanings gets two keys ("Done" the button, "Done" the status).
- **The English stays exactly as it was** when a string moves. Values are text only: no colours, no
  markup.

## Dates and numbers

From `src/i18n` too (`format.ts`), so another language writes them its own way:

- `weekdayName(d)` "Wednesday", `monthName(d, 'short')` "Oct", `dayMonth(d, { weekday: 'long' })`
  "Wednesday 28 October", `formatDate(d, options)`, `formatTime(d)` "5:07 PM", `formatNumber(n)` "4,794".
- In English each reads exactly as before: `formatDate` takes the locale the call always used
  (`'en-US'`, the default; `'en-GB'`; or `'device'`, the phone's own), and `formatTime` follows the
  phone (12 or 24 hours).
- Never `toLocaleDateString('en-US', …)` or `toLocaleTimeString([], …)` anywhere in `src/`:
  `src/i18n/__tests__/format.test.ts` fails on a locale written in (or left to the phone).

## The check

`src/i18n/__tests__/noRawStrings.test.ts` fails when an extracted folder (its `EXTRACTED` list) gets
UI text written into the code again. Text it mistakes for UI (an id, a route name, a log) is marked
with `// i18n-ignore` on the line, or alone on the line above, with the reason:
`// i18n-ignore (route names)`. Logs, errors, test ids, styles, imports and comparisons are skipped
by themselves (`jest/rawStrings.ts`).

What's left, per folder, and one folder's strings:

```bash
I18N_PROGRESS=1 npx jest src/i18n/__tests__/noRawStrings
```

```bash
I18N_PROGRESS=1 I18N_FOLDER=components/home npx jest src/i18n/__tests__/noRawStrings
```

## Extracting a folder

1. List its strings (above). Move each into `en/<folder>.ts` and call `t()`; keep the English exactly.
   JSX text spread over lines becomes one value with single spaces, as React showed it.
2. Mark what isn't UI text with `// i18n-ignore (why)`.
3. Add the folder to `EXTRACTED`. The folder's own tests, the scenarios and E2E must pass unchanged.
4. One folder (or two small ones) per PR: other sessions edit these files all the time.

## Arabic

Majd approved the app in Arabic on Nov 21 2026 (part 2; plan in the shared notes, `app-in-arabic-part2-plan.md`).
The words and rules (one term per concept, plurals, digits, typography) are in `ar-glossary.md`.

- **`ar/<folder>.ts`** mirrors `en/<folder>.ts`. A key not there yet shows in English. `ar/types.ts` gives each
  plural Arabic's six forms (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`) and fails the typecheck on a key
  English doesn't have. `__tests__/arabic.test.ts` checks all six forms, the `{{values}}`, Latin text in isolates
  (⁨…⁩), and no › or tatweel. What's left: `I18N_PROGRESS=1 npx jest src/i18n/__tests__/arabic`.
- **Digits** (`digits.ts`): Arabic-Indic, written by the app rather than Intl (Hermes' platforms disagree). A number
  passed to `t()` and everything from `format.ts` comes out in them; English is untouched. `ARABIC_INDIC` is
  Majd's choice 1, still open.
- **The picker** (`choice.ts`): Settings → Appearance → Language, Revisely Dev only (`offeredLanguages`). It's kept on
  the phone (`@revisely_language:v1`) and applied before the first screen (App.tsx waits for `loadLanguageChoice`).
  A change restarts the app, since React Native lays out right to left only from a launch. The store app offers
  `SHIPPED` (English) alone and reads nothing.
- **Right to left** needs no native change: `I18nManager.forceRTL` is a flag React Native reads at launch on iOS
  whatever languages the app declares, and Android's manifest already allows it. A launch that started the other way
  (the first on a phone whose language reads the other way) restarts once in the splash (`loadLanguageChoice`,
  `restartForDirection`; LANG-1), and not again if that restart didn't take. The native release adds the
  system's side: Arabic in iOS Settings → Revisely → Language (`CFBundleLocalizations`), Arabic permission prompts,
  Android 13's per-app language, and the widgets' Swift labels. All of them move the store fingerprints.
- **"Phone's language"** follows the phone only once that release declares Arabic. Until then iOS gives the app
  English, so pick العربية.
