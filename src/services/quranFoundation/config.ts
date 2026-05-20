import Constants from 'expo-constants';

interface QFEnvConfig {
  clientId: string;
  clientSecret: string;
  oauthBase: string;
  apiBase: string;
}

// Quran.Foundation splits credentials across two environments:
//  - Production: full mushaf content, no user/auth features until approval.
//    We use it for the Content API so translations actually work.
//  - Pre-live: limited content, but full auth/user features for testing.
//    We use it for the User API (PKCE login + streak read) until production
//    auth scopes get approved.
// Two configs are kept side-by-side so we can flip either independently.

interface QFExtra {
  // Backward-compat: original single config still read for older builds.
  qf?: Partial<QFEnvConfig>;
  qfContent?: Partial<QFEnvConfig>;
  qfUser?: Partial<QFEnvConfig>;
}

const extra = (Constants.expoConfig?.extra as QFExtra | undefined) ?? {};

function pick(
  primary: Partial<QFEnvConfig> | undefined,
  fallback: Partial<QFEnvConfig> | undefined,
  defaults: QFEnvConfig,
): QFEnvConfig {
  return {
    clientId: primary?.clientId ?? fallback?.clientId ?? defaults.clientId,
    clientSecret: primary?.clientSecret ?? fallback?.clientSecret ?? defaults.clientSecret,
    oauthBase: primary?.oauthBase ?? fallback?.oauthBase ?? defaults.oauthBase,
    apiBase: primary?.apiBase ?? fallback?.apiBase ?? defaults.apiBase,
  };
}

export const QF_CONTENT_CONFIG: QFEnvConfig = pick(extra.qfContent, extra.qf, {
  clientId: '',
  clientSecret: '',
  oauthBase: 'https://oauth2.quran.foundation',
  apiBase: 'https://apis.quran.foundation',
});

export const QF_USER_CONFIG: QFEnvConfig = pick(extra.qfUser, extra.qf, {
  clientId: '',
  clientSecret: '',
  oauthBase: 'https://prelive-oauth2.quran.foundation',
  apiBase: 'https://apis-prelive.quran.foundation',
});

// Convenience endpoints — the rest of the codebase imports these instead
// of reassembling URLs everywhere.
export const QF_CONTENT_TOKEN_ENDPOINT = `${QF_CONTENT_CONFIG.oauthBase}/oauth2/token`;
export const QF_CONTENT_API_BASE = `${QF_CONTENT_CONFIG.apiBase}/content/api/v4`;

export const QF_USER_TOKEN_ENDPOINT = `${QF_USER_CONFIG.oauthBase}/oauth2/token`;
export const QF_USER_AUTHORIZE_ENDPOINT = `${QF_USER_CONFIG.oauthBase}/oauth2/auth`;
export const QF_USER_API_BASE = `${QF_USER_CONFIG.apiBase}/auth/v1`;

// Redirect URI must be registered on the QF OAuth client. The scheme is
// declared in app.config.js; native rebuild required when changing it.
export const QF_REDIRECT_URI = 'revisely://oauth/quran-foundation';

export function isQFContentConfigured(): boolean {
  return !!QF_CONTENT_CONFIG.clientId && !!QF_CONTENT_CONFIG.clientSecret;
}

export function isQFUserConfigured(): boolean {
  return !!QF_USER_CONFIG.clientId && !!QF_USER_CONFIG.clientSecret;
}

// Back-compat aliases — keep the old names alive so existing call sites
// don't break. Prefer the *_CONTENT_*/*_USER_* names in new code.
export const QF_CONFIG = QF_CONTENT_CONFIG;
export const QF_TOKEN_ENDPOINT = QF_CONTENT_TOKEN_ENDPOINT;
export const QF_AUTHORIZE_ENDPOINT = QF_USER_AUTHORIZE_ENDPOINT;
export const QF_CONTENT_BASE = QF_CONTENT_API_BASE;
export const QF_USER_BASE = QF_USER_API_BASE;
export const isQFConfigured = isQFContentConfigured;
