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
  removeMushafDownload,
} from './mushafOffline';
import { networkState, onUnmeteredNetwork } from './networkState';

/** Megabytes as the system counts them (1 MB = 1,000,000 bytes), e.g. "247 MB", never split across lines. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / 1e6;
  return `${mb >= 10 ? Math.round(mb) : Math.max(0.1, Math.round(mb * 10) / 10)}\u00A0MB`;
}

/** The row's value (right) and the line under its label. */
export function describeMushaf(s: MushafStatus): { value: string; subtitle: string } {
  // While the pages are done and the text isn't, the progress names the text.
  const pages = s.pages >= s.total && !s.textReady ? 'the text and translation' : `${s.pages} of ${s.total} pages`;
  const percent = `${s.totalBytes > 0 ? Math.floor((s.bytes / s.totalBytes) * 100) : 0}%`;
  const over = s.prefs.cellular ? 'Wi-Fi or mobile data' : 'Wi-Fi';
  switch (s.phase) {
    case 'complete':
      return {
        value: 'Downloaded',
        subtitle: `All ${s.total} pages and Saheeh International · ${formatMegabytes(s.bytes)}`,
      };
    case 'downloading':
      return { value: percent, subtitle: `Downloading · ${pages}` };
    case 'pending':
      return s.pages > 0 || s.textReady
        ? { value: percent, subtitle: `Downloads on ${over} · ${pages}` }
        : { value: '', subtitle: `Downloads on ${over} · ${formatMegabytes(s.totalBytes)}` };
    case 'waiting-for-wifi':
      return { value: 'Download', subtitle: `Waiting for Wi-Fi · ${pages}` };
    case 'offline':
      return { value: percent, subtitle: `Continues when you're online · ${pages}` };
    case 'paused':
      return {
        value: 'Download',
        subtitle: s.pages > 0 ? `${s.pages} of ${s.total} pages on this phone` : `Not on this phone · ${formatMegabytes(s.totalBytes)}`,
      };
    case 'no-space':
      return { value: percent, subtitle: `Not enough free space · ${pages}` };
    case 'error':
      return { value: percent, subtitle: `Some of it didn't download · tries again soon` };
    default:
      return { value: '', subtitle: 'Every page and Saheeh International, for reading offline' };
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
      label: 'Download now',
      icon: 'cloud-download-outline',
      onPress: () => downloadNow(s),
    });
  }
  // Something of the download is here (a few suras read since Remove don't count).
  if (s.pages > 0 || s.textReady) {
    actions.push({
      key: 'remove',
      label: 'Remove from this phone',
      icon: 'trash-outline',
      destructive: true,
      onPress: () =>
        Alert.alert(
          'Remove the offline mushaf?',
          `This frees ${formatMegabytes(s.bytes)}. Pages and translations you open still download as you read.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => void removeMushafDownload() },
          ],
        ),
    });
  }
  return actions;
}

/** Download now: on mobile data (not allowed in Settings), it asks first. */
function downloadNow(s: MushafStatus) {
  const net = networkState();
  if (net?.connected && !onUnmeteredNetwork(net) && !s.prefs.cellular) {
    Alert.alert(
      'Download over mobile data?',
      `About ${formatMegabytes(Math.max(0, s.totalBytes - s.bytes))} left to download.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => void downloadMushafNow({ overMobileData: true }) },
      ],
    );
    return;
  }
  void downloadMushafNow();
}
