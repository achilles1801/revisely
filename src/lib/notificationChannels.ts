/** Android's channel for the daily reminder and the reading timer (its id since the first version). */
export const REMINDER_CHANNEL_ID = 'default';

/**
 * Android's channels for prayer notifications. Android takes a notification's sound
 * from its channel (8.0 on), not from the notification, so "silent" needs its own.
 */
export const PRAYER_CHANNEL_ID = 'prayer';
export const PRAYER_SILENT_CHANNEL_ID = 'prayer-silent';
