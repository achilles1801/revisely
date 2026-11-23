// components/player: the mini player above the tab bar while a recitation plays elsewhere.
export const player = {
  failed: 'Couldn’t play',
  pause: 'Pause recitation',
  play: 'Play recitation',
  stop: 'Stop recitation',
  open: 'Open in the reader',
  /** VoiceOver's name for the verse and reciter: "Al-Baqarah 2:13, Alafasy. Open in the reader". */
  openLabel: '{{verse}}, {{detail}}. Open in the reader',
} as const;
