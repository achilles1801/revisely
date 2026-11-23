// components/help: the ? buttons and their sheet. The topics themselves are lib/help's.
export const help = {
  /** VoiceOver's name for a ? button: "Help: Today". */
  button: 'Help: {{title}}',
  askRevo: 'Ask Revo',
  hide: 'Hide help buttons',
  hidden: 'Help buttons hidden. Settings → Help and support brings them back.',
} as const;
