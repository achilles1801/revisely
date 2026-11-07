// Opening Revo from anywhere: the button, Settings, or a screen that wants a question asked
// about something it shows (e.g. an Insights section, with that insight attached). RevoHost
// listens; nothing is sent until the user asks.

import type { RevoAttachment } from './types';

export interface RevoOpenRequest {
  /** Attached to the next question (the user can remove it). */
  attach?: RevoAttachment;
  /** Open this conversation (History, a Day in review). */
  chatId?: string;
  /** Open on Memory, or the opt-in. */
  view?: 'memory' | 'optin';
}

const listeners = new Set<(r: RevoOpenRequest) => void>();
let pending: RevoOpenRequest | null = null;

export function openRevo(request: RevoOpenRequest = {}): void {
  if (listeners.size === 0) {
    pending = request;
    return;
  }
  listeners.forEach((l) => l(request));
}

export function onRevoOpen(listener: (r: RevoOpenRequest) => void): () => void {
  listeners.add(listener);
  if (pending) {
    const r = pending;
    pending = null;
    listener(r);
  }
  return () => {
    listeners.delete(listener);
  };
}
