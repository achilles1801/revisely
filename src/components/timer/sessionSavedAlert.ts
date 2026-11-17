import { Alert } from 'react-native';
import { formatDuration } from '../../lib/readingTimer';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { t } from '../../i18n';

/**
 * After a timer session is saved: say how long it was and offer its day in
 * Activity, where the pages read can be added.
 */
export function alertSessionSaved(date: string, seconds: number, title: string = t('timer.saved.title')) {
  Alert.alert(title, t('timer.saved.body', { duration: formatDuration(seconds) }), [
    { text: t('common.done'), style: 'cancel' },
    { text: t('timer.saved.addPages'), onPress: () => navigateToActivityDay(date) },
  ]);
}
