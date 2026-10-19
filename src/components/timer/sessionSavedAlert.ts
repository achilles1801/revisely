import { Alert } from 'react-native';
import { formatDuration } from '../../lib/readingTimer';
import { navigateToActivityDay } from '../../navigation/navigationRef';

/**
 * After a timer session is saved: say how long it was and offer its day in
 * Activity, where the pages read can be added.
 */
export function alertSessionSaved(date: string, seconds: number, title = 'Session saved') {
  Alert.alert(title, `${formatDuration(seconds)} logged. You can add the pages you read in Activity.`, [
    { text: 'Done', style: 'cancel' },
    { text: 'Add pages', onPress: () => navigateToActivityDay(date) },
  ]);
}
