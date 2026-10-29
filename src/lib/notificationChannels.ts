/** Android's channel for the daily reminder and the reading timer (its id since the first version). */
export const REMINDER_CHANNEL_ID = 'default';

/**
 * Android's channels for prayer notifications. Android takes a notification's sound
 * from its channel (8.0 on), not from the notification, so "silent" needs its own.
 */
export const PRAYER_CHANNEL_ID = 'prayer';
export const PRAYER_SILENT_CHANNEL_ID = 'prayer-silent';
/** The athan's channel: its sound is the bundled default athan (a channel's sound is fixed once made). */
export const PRAYER_ATHAN_CHANNEL_ID = 'prayer-athan';

/** The bundled default athan (assets/sounds, through the expo-notifications plugin's `sounds`). */
export const ATHAN_DEFAULT_SOUND_IOS = 'athan_default.caf';
export const ATHAN_DEFAULT_SOUND_ANDROID = 'athan_default_android.m4a';
