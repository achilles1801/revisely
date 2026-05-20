# Revisely — Quran Foundation Hackathon Submission

## Project title

**Revisely — your Quran revision, kept honest**

## One-line description

A mobile-first hifz revision companion that schedules what you should review today, lets you log it page-by-page, and respects how you actually live — including the fact that "today" doesn't end at midnight if you're up revising after Isha.

## The idea

Most Quran memorization apps stop at the boundary between "I learned this" and "I need to keep this." Revisely lives entirely in the second half — the lifelong practice of revising what you've already memorized so it stays with you. The product is built around four ideas that we believe matter for Quran-engagement durability:

1. **A daily revision queue you actually finish.** Pick how many pages you want to revise per day. Revisely picks which pages, using a rotating window over what you've memorized so nothing gets neglected. Your daily session is one tap from the dashboard, and the page-by-page checkoff flow is designed for a 10-minute commute, not a 30-minute setup.

2. **A page-honest model.** Memorization is rarely surah-aligned at the boundaries — page 595 holds Ash-Shams, Al-Layl, and Ad-Duha together. Revisely lets you mark whole surahs as memorized for the long ones, individual pages for the messy in-between, and shows you every surah on the page when you're revising so what's on the mushaf is what's in the app.

3. **A boundary that matches Islamic life.** Your day doesn't end at midnight — it ends at fajr. Toggle fajr-rollover in Settings and a 1 AM revision session counts as today's, not tomorrow's. Times come from local astronomical calculation (Adhan library) using your coordinates and your chosen calculation method.

4. **A streak that follows you across the Quran.com ecosystem.** Sign in with your Quran.com account and your QF-side streak shows up in Revisely. Activity tracked here can extend the streak you already have on Quran.com / QuranReflect / other Connected Apps — your relationship with the Qur'an isn't fragmented across silos.

## Effective use of APIs

Revisely uses two Quran.Foundation APIs.

### Content API — `/content/api/v4/verses/by_page/{page}`

Where: the active revision screen. While reviewing a page, the user taps the translation icon in the header and sees every verse on that page in Uthmani Arabic with the English translation (Saheeh International / translation resource `131`).

Why this is meaningful for the product: a memorizer who can't recall a verse can quickly check meaning without leaving the session. It also reinforces *understanding* alongside memorization, which is the engagement layer the hackathon brief is pointed at.

How: app-credentials OAuth2 (`grant_type=client_credentials`, `scope=content`) at `prelive-oauth2.quran.foundation/oauth2/token`, then the Content API call with `x-auth-token` + `x-client-id`. Token cached in memory and refreshed near the 3600s expiry. See `src/services/quranFoundation/contentToken.ts` and `src/services/quranFoundation/content.ts`.

### User API — `/auth/v1/streaks/current_streak_days`

Where: Settings → "Quran.com account" card. After the user signs in with Quran.com (PKCE OAuth flow), their current QF streak appears under the connection. Local Firestore streak still lives — running both means the user's commitment record stays whole even if they revoke either side.

Why: streak is the most visible signal of habit in this product category. Pulling it from QF means Revisely participates in the ecosystem's existing accountability layer instead of building an isolated streak that vanishes the day a user switches apps.

How: PKCE OAuth flow via `expo-auth-session` against `prelive-oauth2.quran.foundation/oauth2/auth`, code exchange handled in `src/services/quranFoundation/oauth.ts`. Tokens persisted in `AsyncStorage`, refresh handled near expiry. Scopes requested: `openid offline_access streak goal reading_session`. See `src/services/quranFoundation/streaks.ts` and `src/components/QuranFoundationCard.tsx`.

## Live demo / working app link

(TestFlight or download link here — fill in once the EAS build completes.)

## GitHub repository

(Public link here.)

## Technical execution highlights

- **Built with**: React Native + Expo, TypeScript, Firebase (Firestore, Auth), Quran.Foundation APIs (Content + User), Adhan-JS for astronomical fajr calculation, `expo-auth-session` for PKCE.
- **Day-boundary architecture**: single `getCurrentRevisionDay(user)` helper is the source of truth for "what day is this for revision purposes." When fajr-rollover is enabled, it consults the user's coords + calculation method via `adhan`; otherwise it falls back to local midnight. All log-writing and "today" comparisons route through this helper.
- **Page/surah dual model**: pages are the storage truth, surahs are the user-intent layer on top. Toggling a surah cascades to its pages with shared-page protection — when un-checking, a page only clears if no other still-memorized surah lives on it. Fixes the long-standing "marking Shams flips Layl checked" bug without sacrificing the page-level granularity needed for users mid-way through long surahs.
- **Translation sheet** is on-demand (no preload, no caching beyond the in-flight token), so the Content API gets a clean usage signature: one request per page when the user explicitly asks for it.
- **OAuth**: PKCE with `expo-auth-session`; client secret lives in `.env` for the pre-live environment only and is used at the token endpoint via Basic auth. The redirect URI `revisely://oauth/quran-foundation` is bound to the `revisely` URL scheme declared in `app.config.js`.

## What's next

- **Activity Days API + Goals API**: write our daily revision sessions back to QF so the streak we *read* is also one we *contribute to*. Reading-side integration first; writing-side once the production-scope approval lands.
- **Smart Tracking with QF Bookmarks**: surface "you bookmarked this on Quran.com" cues during revision sessions.
- **Reflection prompts** via QF Posts API: optional micro-journaling at the end of a session, syncing to QuranReflect.
- **Audio recitation on the revision page** via the Content API's audio endpoints.

## Team

(Names here.)

---

*Built during the Quran Foundation hackathon, Ramadan–Dhu al-Hijjah 1447.*
