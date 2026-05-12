import Constants from 'expo-constants';
import { auth } from './firebase';
import { getAppCheckToken } from './appCheck';
import { UserPage, PageStatus } from '../types';
import { getPagesForJuz, getPagesForSurah } from './quranData';
import { logger } from './logger';

const FUNCTION_REGION = 'us-central1';
const FUNCTION_NAME = 'parseMemorizationInput';

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in to use AI parsing.');
    this.name = 'NotSignedInError';
  }
}

export type ConversationTurn = { role: 'user' | 'assistant'; content: string };

export type ParsedEntry =
  | { type: 'juz'; juz: number; status: 'memorized' | 'in_progress' }
  | { type: 'surah'; surah: number; status: 'memorized' | 'in_progress' }
  | {
      type: 'page_range';
      startPage: number;
      endPage: number;
      status: 'memorized' | 'in_progress';
    };

export type ParseMemorizationResult = {
  entries: ParsedEntry[];
  summary: string;
  needs_clarification: boolean;
  clarification_question: string | null;
};

export async function parseMemorizationInput(
  transcript: string,
  history: ConversationTurn[] = [],
): Promise<ParseMemorizationResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new NotSignedInError();
  }
  const idToken = await user.getIdToken(/* forceRefresh */ true);
  const appCheckToken = await getAppCheckToken();

  const projectId = Constants.expoConfig?.extra?.firebase?.projectId;
  if (!projectId) {
    throw new Error('Firebase projectId is not configured.');
  }
  const url = `https://${FUNCTION_REGION}-${projectId}.cloudfunctions.net/${FUNCTION_NAME}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
  if (appCheckToken) {
    headers['X-Firebase-AppCheck'] = appCheckToken;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: { transcript, history } }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    logger.warn(
      `[parseMemorization] HTTP ${resp.status} from ${url}\nbody: ${text.slice(0, 500)}`,
    );
    let message = `HTTP ${resp.status}: ${text.slice(0, 200)}`;
    let isAuthError = resp.status === 401 || resp.status === 403;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) message = parsed.error.message;
      if (parsed?.error?.status === 'UNAUTHENTICATED') isAuthError = true;
    } catch {
      // Non-JSON body — keep raw text in message.
    }
    if (isAuthError) {
      const err: any = new Error(message);
      err.code = 'functions/unauthenticated';
      throw err;
    }
    throw new Error(message);
  }

  const json = await resp.json();
  return json.result as ParseMemorizationResult;
}

function pagesForEntry(entry: ParsedEntry): number[] {
  if (entry.type === 'juz') return getPagesForJuz(entry.juz);
  if (entry.type === 'surah') return getPagesForSurah(entry.surah);
  const pages: number[] = [];
  for (let p = entry.startPage; p <= entry.endPage; p++) pages.push(p);
  return pages;
}

/**
 * Apply parsed entries to the user's pages. Pages not covered by any entry
 * are reset to `not_memorized`. Within a single submission, "memorized"
 * wins over "in_progress" when both apply to the same page.
 */
export function applyEntriesToPages(
  pages: UserPage[],
  entries: ParsedEntry[],
): { pages: UserPage[]; changedPageNumbers: number[] } {
  const statusByPage = new Map<number, 'memorized' | 'in_progress'>();
  for (const entry of entries) {
    for (const pageNum of pagesForEntry(entry)) {
      const existing = statusByPage.get(pageNum);
      if (existing === 'memorized') continue;
      statusByPage.set(pageNum, entry.status);
    }
  }

  const now = new Date().toISOString();
  const changed: number[] = [];
  const updated: UserPage[] = pages.map((p) => {
    const target: PageStatus = statusByPage.get(p.pageNumber) ?? 'not_memorized';
    if (p.status === target) return p;
    changed.push(p.pageNumber);
    return {
      ...p,
      status: target,
      dateMemorized: target === 'memorized' ? now : null,
    };
  });

  return { pages: updated, changedPageNumbers: changed };
}
