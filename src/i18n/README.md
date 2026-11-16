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
- Never `toLocaleDateString('en-US', …)` or `toLocaleTimeString([], …)` in a folder listed in
  `FORMATTED` (`src/i18n/__tests__/format.test.ts`).

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

## Not yet

- The `›` and `‹` in text from one helper that knows the direction (step 5).
- The language picker, Arabic itself and right-to-left layout: they wait for the rest, and the native
  part (declaring Arabic, iOS's RTL flag) for the next native release.
