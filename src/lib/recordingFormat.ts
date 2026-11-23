import { t } from '../i18n';
import { formatNumeral } from '../i18n';
// Display helpers for recordings (kept free of native imports for tests).

/** 0:07, 1:23, 1:02:05 */
export function formatRecordingTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 0.4 MB, 12 MB, 1.2 GB */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return t('common.megabytes', { n: formatNumeral(Math.max(0.1, bytes / (1024 * 1024)).toFixed(1)) });
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return t('common.megabytes', { n: mb < 10 ? formatNumeral(mb.toFixed(1)) : Math.round(mb) });
  }
  return t('common.gigabytes', { n: formatNumeral((bytes / (1024 * 1024 * 1024)).toFixed(1)) });
}
