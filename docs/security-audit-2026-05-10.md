# Revisley Security Review — 2026-05-10 (re-run)

## Summary

- **0 CRITICAL, 0 HIGH, 1 MEDIUM** finding (confidence ≥ 7/10).
- Stack: React Native (Expo) + Firebase (Auth + Firestore) + 1 Cloud Function calling Anthropic.
- Three of the four findings from the first pass are fully resolved. The remaining gap is that App Check is **installed and sent** by the client but **not enforced** by the Cloud Function — a one-line fix.

**Status of previous findings:**

| # | Finding | Status |
|---|---------|--------|
| 1 | Cloud Function has no App Check / rate limiting | **PARTIAL** — rate limit + maxInstances=3 done; App Check client wired; **`enforceAppCheck: true` still missing on the function** |
| 2 | Cloud Function trusts `history[].role` / `history[].content` | **FIXED** — role allowlist + per-turn 2000-char cap |
| 3 | Firestore update rules lack field allowlist | **FIXED** — `hasOnly()` allowlists added on users/pages/sessions |
| 4 | `fast-xml-builder` HIGH advisory in `functions/` deps | **FIXED** — `npm audit --omit=dev` now shows 9 low, 0 high |

**Single remaining action before launch:** add `enforceAppCheck: true` to the `onCall` options in [functions/src/index.ts:211](../functions/src/index.ts#L211).

---

## Findings

### [MEDIUM] App Check is wired on the client but not enforced on the Cloud Function

**File:** [functions/src/index.ts:210-212](../functions/src/index.ts#L210-L212)
**Category:** other (cost-of-service / abuse)
**Confidence:** 9/10

**Issue:** The client now correctly initializes App Check ([src/lib/appCheck.ts](../src/lib/appCheck.ts), bootstrapped in [App.tsx:11](../App.tsx#L11)) and forwards the resulting token as `X-Firebase-AppCheck` on every call to `parseMemorizationInput` ([src/lib/parseMemorization.ts:45-59](../src/lib/parseMemorization.ts#L45-L59)). However, the function itself does **not** set `enforceAppCheck: true` in its `onCall` options. The Firebase Functions v2 runtime treats App Check as opt-in: when `enforceAppCheck` is unset (or `false`), the runtime **accepts calls regardless of whether the `X-Firebase-AppCheck` header is present or valid**. The header is essentially ignored on the server side.

Concrete impact:
- A curl loop with a stolen / minted Firebase ID token (anyone can sign up an email/password account in seconds — no email verification gate) can still hit the function from any host, without an App Check token, and will be served.
- The per-user rate limit (30/hour, [functions/src/index.ts:22-57](../functions/src/index.ts#L22-L57)) caps damage per account, but does not stop multi-account abuse — an attacker can script account creation and get N × 30 calls/hour.
- `maxInstances: 3` ([functions/src/index.ts:13](../functions/src/index.ts#L13)) caps concurrency tightly, which materially limits worst-case spend. With v2's default 80-concurrency-per-instance, that's still up to ~240 in-flight requests, but the request burn rate is bounded.

This is genuinely close to done — the client work and the rate-limit work do most of the heavy lifting. The missing flag is the piece that turns a "harder to abuse" function into a "can only be called from a real app install" function.

**Code (current):**
```typescript
export const parseMemorizationInput = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (request): Promise<ParseResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    // ...
  },
);
```

**Exploit scenario:**
1. Attacker signs up via Firebase Auth (`createUserWithEmailAndPassword`) from a script — no App Check needed for this, and email verification isn't required.
2. Attacker calls `https://us-central1-revision-buddy-3a398.cloudfunctions.net/parseMemorizationInput` with the resulting ID token in `Authorization: Bearer …` and **no** `X-Firebase-AppCheck` header. The function accepts the call.
3. Per-user rate limit allows 30 calls/hour for that account.
4. Attacker scripts the signup + call loop across N accounts; total request volume scales linearly with account count.

With `enforceAppCheck: true`, step 2 would fail because the call would arrive without a valid attestation, and producing a valid attestation requires running on a real iOS/Android install with App Attest / Play Integrity.

**Fix:** One line in the onCall options:

```typescript
export const parseMemorizationInput = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 30,
    enforceAppCheck: true,        // <-- add this
    consumeAppCheckToken: true,   // optional; enables replay protection
  },
  async (request): Promise<ParseResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    // ...
  },
);
```

Caveats / things to test before flipping the flag:
- Confirm App Check is **registered and active** for this Firebase project (Console → App Check → Apps → DeviceCheck/App Attest for iOS, Play Integrity for Android).
- Register the simulator debug token in the Console under App Check → Apps → Manage debug tokens, and set `DEBUG_TOKEN` in [src/lib/appCheck.ts:9](../src/lib/appCheck.ts#L9) for local dev. Without this, simulator builds will be rejected once enforcement is on.
- Watch metrics for the first 24-48 hours after enabling — if you have any users on iOS < 14 (no App Attest), DeviceCheck fallback is the only option for them; the current `appAttestWithDeviceCheckFallback` provider already handles this.
- The client already fails-open on token-fetch errors (`getAppCheckToken` returns `null` and the header is omitted). Once `enforceAppCheck: true` is on, those calls will start failing on the server, which is the desired behavior.

Once that ships, this finding closes.

---

## What's now fully resolved

### Finding #2 — `history` validation in Cloud Function (FIXED)

[functions/src/index.ts:235-247](../functions/src/index.ts#L235-L247) now enforces:
- `turn` must be an object;
- `role` must be one of `'user' | 'assistant'`;
- `content` must be a string of length 1–2000.

This fully closes the size-cap-bypass vector — the maximum input forwarded to Anthropic is now bounded by `6 * 2000 + 2000 ≈ 14 KB` of user text plus the cached system prompt.

### Finding #3 — Firestore field allowlists (FIXED)

[firestore.rules:116-151](../firestore.rules#L116-L151) defines `userMutableFields()`, `pageMutableFields()`, `sessionMutableFields()`, and a `changedKeys()` helper. Every `update` rule now starts with `changedKeys().hasOnly(<allowlist>)`, blocking arbitrary key injection on user docs, page docs, and session docs. The existing inline validations (range checks, state-transition checks, immutable-id checks) remain in place on top of the allowlist.

The launch-checklist TODO in the rules file ([firestore.rules:110-113](../firestore.rules#L110-L113)) correctly flags that stat fields (`streak`, `totalMemorizedPages`, `totalLearningPages`, `totalSessionsCompleted`, `totalPagesRevisedAllTime`, `lastRevisionDate`) are still client-writable because the corresponding writes still come from `firestoreService.ts`. Moving those into a Cloud Function with admin SDK and removing them from `userMutableFields()` is the right next step but is a non-trivial refactor — keep it on the launch checklist, don't block on it.

The rate-limit subcollection (`users/{uid}/_quota/parseMemorization`) introduced by the Cloud Function has no explicit allow rule, so the default-deny `match /{document=**}` catches client access to it. The function uses the admin SDK, which bypasses rules. Verified clean.

### Finding #4 — npm audit on functions/ (FIXED)

```
9 low severity vulnerabilities
```

The previous HIGH (`fast-xml-builder`) is gone. The remaining lows are deep transitives under `firebase-admin` → `@google-cloud/firestore` → `google-gax` → `retry-request` → `teeny-request`, none of which are in your code path. Re-check after future `firebase-admin` major bumps but no action needed now.

---

## Newly Introduced Surface (reviewed, no findings)

- **AsyncStorage auth persistence** ([src/lib/firebase.ts:53-61](../src/lib/firebase.ts#L53-L61)) — standard RN pattern; ID tokens stored in AsyncStorage on the device. AsyncStorage is unencrypted but is sandboxed per-app on iOS/Android, which is the same protection model the SDK used before. Not a finding.
- **App Check debug-token field** ([src/lib/appCheck.ts:9](../src/lib/appCheck.ts#L9)) — currently `undefined`, so no debug token is shipped in the bundle. Make sure it stays `undefined` for production builds; if you ever hardcode a debug token here for convenience, anyone with the .ipa/.apk can extract it and use it to bypass App Check. Worth a CI lint rule but not a current finding.
- **`firebase-admin` initialization in functions** ([functions/src/index.ts:15-18](../functions/src/index.ts#L15-L18)) — guarded with `getApps().length === 0`, correct.
- **Rate-limit transaction** ([functions/src/index.ts:25-57](../functions/src/index.ts#L25-L57)) — uses `runTransaction` correctly, fails closed on Firestore errors (any thrown error propagates and the Anthropic call never runs). Sliding-window-on-first-call semantics; acceptable for this use case.

---

## Methodology Notes

- Re-read the full diff against `HEAD` (38 files changed; only [firestore.rules](../firestore.rules), [functions/src/index.ts](../functions/src/index.ts), [src/lib/parseMemorization.ts](../src/lib/parseMemorization.ts), [src/lib/appCheck.ts](../src/lib/appCheck.ts), [App.tsx](../App.tsx), [app.config.js](../app.config.js), and [src/lib/firebase.ts](../src/lib/firebase.ts) were security-relevant; the rest were UI/refactor noise).
- Re-ran `npm audit --omit=dev` in `functions/` to confirm the HIGH advisory is gone.
- Traced the App Check path end-to-end: provider config → token fetch → header attach on client → onCall options on server. The break is at the server: header arrives but is not required.
- Verified that the new `_quota` subcollection introduced by the rate limiter is not reachable by clients (no allow rule + default-deny catch-all).
