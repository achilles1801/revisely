# Lint and format

ESLint for the app: `src/`, `App.tsx` and `index.ts`. CI runs it in Fast checks: an error fails the check, and a
warning doesn't.

```bash
npm ci --prefix scripts/lint
npx --prefix scripts/lint eslint -c scripts/lint/eslint.config.mjs .            # errors and warnings
npx --prefix scripts/lint eslint -c scripts/lint/eslint.config.mjs --quiet .    # errors only, as CI
npx --prefix scripts/lint eslint -c scripts/lint/eslint.config.mjs src/lib/streak.ts   # one file
```

## Format (Prettier)
`prettier.config.mjs` is the style the code was already written in (single quotes, semicolons, trailing commas), with
lines up to 120 characters. CI checks only the folders in `formatted.txt`.

```bash
npx --prefix scripts/lint prettier --config scripts/lint/prettier.config.mjs --check $(grep -v '^#' scripts/lint/formatted.txt)
npx --prefix scripts/lint prettier --config scripts/lint/prettier.config.mjs --write src/lib/streak.ts   # one file
```

To add a folder:
1. Check that no open PR touches it.
2. Format it with `--write`.
3. Add it to `formatted.txt`.
4. Open a PR with nothing else in it.

Never format the whole repository in one PR: every open branch would conflict. After that, run `--write` on any file
you change in that folder.

## Why it lives here
- **The fingerprint:** the app's `package.json` is part of the store fingerprint. Its whole `scripts` block is
  hashed, so a `"lint"` script there would start a native build. So the tools have their own `package.json` and lock
  file here, as `tests/scenarios` does.
- **The app hash:** a config file at the repository root would change the app hash (`.github/scripts/app-hash.sh`)
  and publish a preview update. `scripts/` is outside it.

## What it checks
Expo's own config for SDK 54 (`eslint-config-expo` 10), with four changes:
- `import/no-cycle` is an error: no import cycles (`import type` doesn't count). It adds about 45 s to a full run.
- `react/no-unescaped-entities` is off: a React Native `<Text>` shows `'` and `"` as they are.
- `react/display-name` is a warning: names help in React DevTools, but an anonymous `memo()` isn't a bug.
- In tests, `require` in `jest.mock`, imports after mocks, anonymous mock components and `children` as a prop are
  allowed.

It uses ESLint 9 because Expo's React and import plugins don't take ESLint 10 yet. Move to 10 with the Expo SDK
that does.

The other projects aren't linted here: `functions/`, `worker/` and `tests/scenarios`.

## Editors
VS Code's ESLint extension, in your user or workspace settings:

```json
"eslint.options": { "overrideConfigFile": "scripts/lint/eslint.config.mjs" },
"eslint.nodePath": "scripts/lint/node_modules"
```
