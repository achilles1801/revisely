// What Settings → Offline mushaf says for each state of the download: the
// pages, the Arabic text and Saheeh International (lib/mushafOffline).

import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import type { SheetAction } from '../components/v2/ActionSheet';
import {
  downloadMushafNow,
  getMushafStatus,
  MushafStatus,
  onMushafStatus,
  otherEditionsOnPhone,
  removeMushafDownload,
} from './mushafOffline';
import { networkState, onUnmeteredNetwork } from './networkState';
import { t } from '../i18n';
import { formatNumber } from '../i18n';

/** Megabytes as the system counts them (1 MB = 1,000,000 bytes), e.g. "247 MB", never split across lines. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / 1e6;
  return t('common.megabytesTight', { n: mb >= 10 ? Math.round(mb) : Math.max(0.1, Math.round(mb * 10) / 10) });
}

/** The row's value (right) and the line under its label. */
export function describeMushaf(s: MushafStatus): { value: string; subtitle: string } {
  // While the pages are done and the text isn't, the progress names the text.
  const pages = s.pages >= s.total && !s.textReady ? t('mushaf.offline.textAndTranslation') : t('mushaf.offline.pagesOf', { pages: s.pages, total: s.total });
  const percent = formatNumber(s.totalBytes > 0 ? Math.floor((s.bytes / s.totalBytes) * 100) / 100 : 0, { style: 'percent' });
  const over = s.prefs.cellular ? t('mushaf.offline.wifiOrData') : t('mushaf.offline.wifi');
  switch (s.phase) {
    case 'complete':
      return {
        value: t('mushaf.offline.downloaded'),
        subtitle: t('mushaf.offline.allPages', { total: s.total, size: formatMegabytes(s.bytes) }),
      };
    case 'downloading':
      return { value: percent, subtitle: t('mushaf.offline.downloading', { pages }) };
    case 'pending':
      return s.pages > 0 || s.textReady
        ? { value: percent, subtitle: t('mushaf.offline.downloadsOn', { over, what: pages }) }
        : { value: '', subtitle: t('mushaf.offline.downloadsOn', { over, what: formatMegabytes(s.totalBytes) }) };
    case 'waiting-for-wifi':
      return { value: t('mushaf.offline.download'), subtitle: t('mushaf.offline.waitingWifi', { pages }) };
    case 'offline':
      return { value: percent, subtitle: t('mushaf.offline.continuesOnline', { pages }) };
    case 'paused':
      return {
        value: t('mushaf.offline.download'),
        subtitle:
          s.pages > 0
            ? t('mushaf.offline.pagesOnPhone', { pages: s.pages, total: s.total })
            : t('mushaf.offline.notOnPhone', { size: formatMegabytes(s.totalBytes) }),
      };
    case 'no-space':
      return { value: percent, subtitle: t('mushaf.offline.noSpace', { pages }) };
    case 'error':
      return { value: percent, subtitle: t('mushaf.offline.error') };
    default:
      return { value: '', subtitle: t('mushaf.offline.idle') };
  }
}

/** The download's status, kept current. */
export function useMushafOffline(): MushafStatus {
  return useSyncExternalStore(onMushafStatus, getMushafStatus);
}

/** The menu under the row: Download now (unless it's all here) and Remove (if anything is). */
export function mushafMenuActions(s: MushafStatus): SheetAction[] {
  const actions: SheetAction[] = [];
  if (s.phase !== 'complete') {
    actions.push({
      key: 'download',
      label: t('mushaf.offline.downloadNow'),
      icon: 'cloud-download-outline',
      onPress: () => downloadNow(s),
    });
  }
  // Something of the download is here (a few suras read since Remove don't count).
  if (s.pages > 0 || s.textReady) {
    actions.push({
      key: 'remove',
      label: t('mushaf.offline.remove'),
      icon: 'trash-outline',
      destructive: true,
      onPress: () => {
        // Remove takes the other print's pages too (Settings → Mushaf); listed on the tap, not each render.
        const freed = s.bytes + otherEditionsOnPhone().reduce((n, o) => n + o.bytes, 0);
        Alert.alert(
          t('mushaf.offline.removeTitle'),
          t('mushaf.offline.removeBody', { size: formatMegabytes(freed) }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('mushaf.offline.removeButton'), style: 'destructive', onPress: () => void removeMushafDownload() },
          ],
        );
      },
    });
  }
  return actions;
}

/** Download now: on mobile data (not allowed in Settings), it asks first. */
function downloadNow(s: MushafStatus) {
  const net = networkState();
  if (net?.connected && !onUnmeteredNetwork(net) && !s.prefs.cellular) {
    Alert.alert(
      t('mushaf.offline.dataTitle'),
      t('mushaf.offline.dataBody', { size: formatMegabytes(Math.max(0, s.totalBytes - s.bytes)) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('mushaf.offline.download'), onPress: () => void downloadMushafNow({ overMobileData: true }) },
      ],
    );
    return;
  }
  void downloadMushafNow();
}
