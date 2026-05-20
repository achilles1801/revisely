import { QF_CONTENT_CONFIG, QF_CONTENT_TOKEN_ENDPOINT } from './config';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

// Refresh slightly before expiry so a request in flight doesn't race the clock.
const EXPIRY_SAFETY_MS = 60 * 1000;

/**
 * Client-credentials access token for the Content API. App-only — no user
 * login required. Cached in memory; refreshed on demand when expired.
 *
 * Note: this exposes the client secret to the bundle. Acceptable for
 * hackathon / development with pre-live credentials. Production should
 * proxy this through a backend.
 */
export async function getContentAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - EXPIRY_SAFETY_MS > now) {
    return cached.accessToken;
  }

  const basicAuth =
    typeof btoa === 'function'
      ? btoa(`${QF_CONTENT_CONFIG.clientId}:${QF_CONTENT_CONFIG.clientSecret}`)
      : Buffer.from(`${QF_CONTENT_CONFIG.clientId}:${QF_CONTENT_CONFIG.clientSecret}`).toString(
          'base64',
        );

  const res = await fetch(QF_CONTENT_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=content',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`QF content token failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cached = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cached.accessToken;
}

export function clearContentTokenCache(): void {
  cached = null;
}
