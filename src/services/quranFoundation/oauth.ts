import { QF_USER_CONFIG, QF_USER_TOKEN_ENDPOINT, QF_REDIRECT_URI } from './config';
import {
  loadQFSession,
  saveQFSession,
  clearQFSession,
  QFUserSession,
} from './storage';

const EXPIRY_SAFETY_MS = 60 * 1000;

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

function basicAuthHeader(): string {
  const raw = `${QF_USER_CONFIG.clientId}:${QF_USER_CONFIG.clientSecret}`;
  return typeof btoa === 'function'
    ? btoa(raw)
    : Buffer.from(raw).toString('base64');
}

function tokenToSession(raw: RawTokenResponse, fallbackScope: string): QFUserSession {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt: Date.now() + raw.expires_in * 1000,
    scope: raw.scope ?? fallbackScope,
  };
}

/**
 * Exchange an authorization code (from the PKCE redirect) for an access token.
 * Persists the resulting session so subsequent API calls can read it.
 */
export async function exchangeCodeForToken(input: {
  code: string;
  codeVerifier: string;
  scope: string;
}): Promise<QFUserSession> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: QF_REDIRECT_URI,
    code_verifier: input.codeVerifier,
    client_id: QF_USER_CONFIG.clientId,
  });

  const res = await fetch(QF_USER_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuthHeader()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`QF code exchange failed: ${res.status} ${text}`);
  }

  const raw = (await res.json()) as RawTokenResponse;
  const session = tokenToSession(raw, input.scope);
  await saveQFSession(session);
  return session;
}

async function refreshToken(refreshTokenValue: string, scope: string): Promise<QFUserSession> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
    client_id: QF_USER_CONFIG.clientId,
  });

  const res = await fetch(QF_USER_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuthHeader()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`QF refresh failed: ${res.status} ${text}`);
  }

  const raw = (await res.json()) as RawTokenResponse;
  // Servers don't always rotate refresh tokens — preserve the old one if the
  // new response omits it.
  const session = tokenToSession(raw, scope);
  if (!session.refreshToken) session.refreshToken = refreshTokenValue;
  await saveQFSession(session);
  return session;
}

/**
 * Return a valid user access token, refreshing if expired. Returns null when
 * the user has not connected QF or refresh fails.
 */
export async function getValidUserAccessToken(): Promise<string | null> {
  const session = await loadQFSession();
  if (!session) return null;

  if (session.expiresAt - EXPIRY_SAFETY_MS > Date.now()) {
    return session.accessToken;
  }

  if (!session.refreshToken) {
    await clearQFSession();
    return null;
  }

  try {
    const refreshed = await refreshToken(session.refreshToken, session.scope);
    return refreshed.accessToken;
  } catch {
    await clearQFSession();
    return null;
  }
}

export async function isQFConnected(): Promise<boolean> {
  return (await loadQFSession()) !== null;
}

export async function disconnectQF(): Promise<void> {
  await clearQFSession();
}
