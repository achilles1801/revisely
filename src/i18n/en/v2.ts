// components/v2: the shared pieces (sheets, menus, rows). Their buttons are in common.ts.
export const v2 = {
  closeMenu: 'Close menu',
  playbackPosition: 'Playback position',
  /** A row that can be put in another order (ReorderableRows): VoiceOver's actions and what it says after one. */
  moveUp: 'Move up',
  moveDown: 'Move down',
  /** "Coverage, 2 of 6". */
  movedTo: '{{what}}, {{place}} of {{count}}',
} as const;
