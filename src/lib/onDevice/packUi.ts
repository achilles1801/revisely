// What Settings → Downloads and storage says about Recite's pack (Revisely Dev; ONDEV-3).

import { useEffect, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import type { SheetAction } from '../../components/v2/ActionSheet';
import { formatNumber, t } from '../../i18n';
import { getMushafStatus } from '../mushafOffline';
import { formatMegabytes } from '../mushafOfflineUi';
import { networkState, onUnmeteredNetwork } from '../networkState';
import { benchEngine } from './benchRun';
import { downloadPackNow, getPackStatus, onPackStatus, preparePack, removePack, type PackRefusal, type PackStatus } from './packRun';

/** This build carries the native module (older Revisely Dev builds and the store app don't). */
export function packRowShown(): boolean {
  return benchEngine() != null;
}

export function usePackStatus(): PackStatus {
  useEffect(() => {
    preparePack().catch(() => undefined);
  }, []);
  return useSyncExternalStore(onPackStatus, getPackStatus);
}

function unavailableLine(why: PackRefusal | null | undefined): string {
  switch (why) {
    case 'limit':
      return t('settings.recitePack.unavailableLimit');
    case 'app':
      return t('settings.recitePack.unavailableApp');
    case 'verify':
      return t('settings.recitePack.unavailableVerify');
    case 'none':
      return t('settings.recitePack.unavailableNone');
    case 'bad':
      return t('settings.recitePack.unavailableBad');
    case 'paused':
      return t('settings.recitePack.unavailablePaused');
    default:
      return t('settings.recitePack.unavailable');
  }
}

/** Trying again can help: the app couldn't be verified just now, a copy the engine refused can be fetched afresh, or the phone stopped trying by itself. */
const worthRetrying = (s: PackStatus): boolean =>
  s.phase !== 'unavailable' || s.why === 'verify' || s.why === 'bad' || s.why === 'paused';

/** The row's value (right) and the line under its label. */
export function describePack(s: PackStatus): { value: string; subtitle: string } {
  const percent = formatNumber(s.totalBytes > 0 ? Math.floor((s.bytes / s.totalBytes) * 100) / 100 : 0, { style: 'percent' });
  switch (s.phase) {
    case 'ready':
      return { value: t('settings.recitePack.ready'), subtitle: t('settings.recitePack.readySub', { size: formatMegabytes(s.bytes) }) };
    case 'downloading':
      return { value: percent, subtitle: t('settings.recitePack.downloading', { size: formatMegabytes(s.totalBytes) }) };
    case 'waiting-for-wifi':
      return { value: t('settings.recitePack.download'), subtitle: t('settings.recitePack.waitingWifi') };
    case 'offline':
      return { value: '', subtitle: t('settings.recitePack.offline') };
    case 'no-space':
      return { value: '', subtitle: t('settings.recitePack.noSpace', { size: formatMegabytes(s.totalBytes) }) };
    case 'error':
      return { value: '', subtitle: t('settings.recitePack.error') };
    case 'removed':
      return { value: t('settings.recitePack.download'), subtitle: t('settings.recitePack.removed') };
    case 'unavailable':
      return { value: '', subtitle: unavailableLine(s.why) };
    default:
      return { value: '', subtitle: t('settings.recitePack.idle') };
  }
}

/** The menu under the row: Download now unless it's here or trying again can't help, and Remove once it is. */
export function packMenuActions(s: PackStatus): SheetAction[] {
  const actions: SheetAction[] = [];
  if (s.phase !== 'ready' && s.phase !== 'downloading' && worthRetrying(s)) {
    actions.push({
      key: 'download',
      label: t('settings.recitePack.downloadNow'),
      icon: 'cloud-download-outline',
      onPress: () => downloadNow(s),
    });
  }
  if (s.phase === 'ready' || s.bytes > 0) {
    actions.push({
      key: 'remove',
      label: t('settings.recitePack.remove'),
      icon: 'trash-outline',
      destructive: true,
      onPress: () =>
        Alert.alert(t('settings.recitePack.removeTitle'), t('settings.recitePack.removeBody', { size: formatMegabytes(s.bytes) }), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('settings.recitePack.removeButton'), style: 'destructive', onPress: () => void removePack() },
        ]),
    });
  }
  return actions;
}

/** Download now: on mobile data (not allowed in Settings), it asks first. */
function downloadNow(s: PackStatus): void {
  const net = networkState();
  if (net?.connected && !onUnmeteredNetwork(net) && !getMushafStatus().prefs.cellular) {
    const body =
      s.totalBytes > 0
        ? t('settings.recitePack.dataBody', { size: formatMegabytes(Math.max(0, s.totalBytes - s.bytes)) })
        : t('settings.recitePack.dataBodyLarge');
    Alert.alert(t('settings.recitePack.dataTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.recitePack.download'), onPress: () => void downloadPackNow({ overMobileData: true }) },
    ]);
    return;
  }
  void downloadPackNow();
}
