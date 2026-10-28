/** Where users write to us (routed). privacy@ is only for the privacy policy. */
export const SUPPORT_EMAIL = 'support@revisely.app';

/** Settings → Contact support. */
export function supportMailto(subject = 'Revisely support'): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
