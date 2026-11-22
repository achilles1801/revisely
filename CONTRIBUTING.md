# Contributing to Revisely

How changes are made here. `CLAUDE.md` has the full detail behind each point.

## A change, start to finish
1. **Branch from `develop`.** Name it for what it does: `fix/…`, `feat/…`, `chore/…`, `docs/…`.
2. **Keep it small:** one idea per pull request. Use a stack (one layer per PR) for a large change, rebased, never
   merged with develop.
3. **Run the checks** that cover your change (`README.md`, "Checks"), at least types, lint and the tests beside the
   code you touched.
4. **Open the PR into `develop`.** Say what changed and why, and how you checked it. CI's `Required` check must pass.
   PRs into develop merge themselves once it does (`gh pr merge <n> --auto --merge`).
5. **Production** is a separate PR from `develop` into `main`, made by the owner.

## Rules that save a release
- **Bug fixes add a scenario.** A test in `tests/scenarios/` that fails without the fix and names the rule it keeps,
  e.g. `[DAY-2]`. A rule changed on purpose changes in `BEHAVIOUR.md` first, in the same PR.
- **The fingerprint.** Native changes (a library with native code, a plugin, a permission, the icon, `app.config.js`,
  the root `.gitignore`, `package.json`'s `scripts`) start a new binary and need a version bump. Compute the
  fingerprint before and after if you touch any of them (`CLAUDE.md`, "Runtime version is a fingerprint").
- **The app hash.** Every tracked file outside `docs/`, `tests/`, `functions/`, `worker/`, `admin/`, `.maestro/`,
  `store/`, `scripts/`, `.github/` and `*.md` counts as app code, and publishes a preview update when it changes.
- **Firestore rules before features.** A new user-document field needs the rules deployed first, or its writes are
  refused.
- **Secrets never go in the repository.** It's public, and CI's secret scan fails on anything that looks like one.

## Code
- **TypeScript is strict.** Avoid `any`. Use `import type` for types.
- **Lint** (`scripts/lint`): errors fail CI. Don't add warnings, and fix the ones in code you touch.
- **Colours** come only from `src/theme`. A raw hex elsewhere fails `noRawColours.test.ts`.
- **Text people see** goes through `t()` and `src/i18n/en`. Lay out with start and end, never left and right (the app
  also runs right to left).
- **Errors:** report them through `lib/logger` (it sends errors to Sentry). Don't swallow them silently, and say in a
  comment why ignoring one is right.
- **Comments say why the code is the way it is:** a constraint, a trap, the rule it keeps (cite the `BEHAVIOUR.md`
  id). Who decided and when goes in the PR and the commit message.
- **Names:** say what a thing is in plain words. Name any part of the Qur'an by its surahs and juz (`lib/passages`),
  not page numbers.

## Tests
- Tests sit beside the code in `__tests__/`.
- Scenario tests drive the real screens against the Firebase emulators. Start the emulators only through
  `scripts/emulators.sh`.
- A flaky test is fixed at its cause, never retried or skipped (`TESTING.md`, "Flakes").
