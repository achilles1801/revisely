import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { buildReferenceTable } from './quranReference';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// maxInstances is intentionally low until App Check is enabled — caps the
// blast radius of an attacker calling this with a stolen ID token.
setGlobalOptions({ region: 'us-central1', maxInstances: 3 });

if (getApps().length === 0) {
  initializeApp();
}
const adminDb = getFirestore();

const VALID_ROLES = new Set(['user', 'assistant']);
const MAX_TURN_CHARS = 2000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 30;

async function enforceRateLimit(uid: string): Promise<void> {
  const ref = adminDb.doc(`users/${uid}/_quota/parseMemorization`);
  const allowed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    let count = 0;
    let windowStart = now;
    if (snap.exists) {
      const data = snap.data() as { count?: number; windowStart?: number };
      count = typeof data.count === 'number' ? data.count : 0;
      windowStart = typeof data.windowStart === 'number' ? data.windowStart : now;
      if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
        count = 0;
        windowStart = now;
      }
    }
    if (count >= RATE_LIMIT_MAX_CALLS) {
      return false;
    }
    tx.set(ref, {
      count: count + 1,
      windowStart,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!allowed) {
    throw new HttpsError(
      'resource-exhausted',
      `Rate limit exceeded (${RATE_LIMIT_MAX_CALLS}/hour). Try again later.`,
    );
  }
}

type ConversationTurn = { role: 'user' | 'assistant'; content: string };

type ParseRequest = {
  transcript: string;
  history?: ConversationTurn[];
};

type Entry =
  | { type: 'juz'; juz: number; status: 'memorized' | 'in_progress' }
  | { type: 'surah'; surah: number; status: 'memorized' | 'in_progress' }
  | {
      type: 'page_range';
      startPage: number;
      endPage: number;
      status: 'memorized' | 'in_progress';
    };

type ParseResponse = {
  entries: Entry[];
  summary: string;
  needs_clarification: boolean;
  clarification_question: string | null;
};

const REFERENCE_TABLE = buildReferenceTable();

const SYSTEM_PROMPT = `You help users record what they have memorized of the Quran. The user will describe their memorization in plain language (English, Arabic, or a mix). Your job is to translate their description into precise entries by calling the \`set_memorization\` tool exactly once.

${REFERENCE_TABLE}

INTERPRETATION RULES:
- "The last juz" / "Juz Amma" / "Juz 30" = Juz 30.
- "The last 3 juz" = Juz 28, 29, 30. "The last N juz" = Juz (31-N) through 30.
- "The first 3 juz" = Juz 1, 2, 3.
- Surah name variants: accept "Baqarah", "Al-Baqarah", "Bakara", "البقرة", etc. Match to the canonical surah by sound and meaning.
- "I memorized X" → status: "memorized".
- "I just started X" / "I'm beginning X" / "I'm working on X" → emit a page_range entry covering the first 1-2 pages of X with status: "in_progress". Do NOT mark the whole surah/juz as memorized.
- "I'm halfway through X" or "first half of X" → split X's page range and mark the first half as memorized using a page_range entry. Use Math.floor of the midpoint.
- "Second half of X" → mark the second half memorized via page_range.
- Prefer per-juz or per-surah entries when the user names them. Use page_range only for partial coverage like halves or specific page numbers.
- Output exactly one entry per concrete portion the user mentioned. "Last 3 juz" → 3 separate juz entries (juz 28, 29, 30).

CLARIFICATION RULES:
- Set needs_clarification: true ONLY when the input is genuinely ambiguous and you cannot make a reasonable interpretation. Examples that DO need clarification: "some of juz 5" (which part?), "a bit of Yasin" (how much?), "I memorized partway" (where?).
- Examples that DO NOT need clarification — interpret them directly: "last 3 juz" (= 28-30), "just started Baqarah" (first 1-2 pages in_progress), "halfway through juz 17" (first half memorized), "Surah Al-Mulk" (whole surah memorized).
- When you ask, be specific: "How many pages of Surah Yasin have you memorized — the whole surah, half, or just the beginning?" — not "Can you clarify?"
- When asking for clarification, leave \`entries\` empty and \`summary\` brief.

OUTPUT:
- Always call \`set_memorization\` exactly once.
- \`summary\` is a friendly one-sentence recap shown to the user (e.g., "Marked Juz 28-30 as memorized and the first 2 pages of Al-Baqarah as in progress.").`;

const SET_MEMORIZATION_TOOL: Anthropic.Tool = {
  name: 'set_memorization',
  description:
    "Apply the user's described memorization status to specific juz, surahs, or page ranges. Call this tool exactly once per turn — either with the resolved entries, or with needs_clarification: true and a specific question.",
  input_schema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        description:
          "List of memorization entries derived from the user's description. Empty when needs_clarification is true.",
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['juz', 'surah', 'page_range'],
              description: 'The unit of this entry.',
            },
            juz: {
              type: 'integer',
              description: 'Juz number 1-30. Required when type is "juz".',
            },
            surah: {
              type: 'integer',
              description:
                'Surah number 1-114. Required when type is "surah".',
            },
            startPage: {
              type: 'integer',
              description:
                'First page (1-604). Required when type is "page_range".',
            },
            endPage: {
              type: 'integer',
              description:
                'Last page (1-604). Required when type is "page_range".',
            },
            status: {
              type: 'string',
              enum: ['memorized', 'in_progress'],
            },
          },
          required: ['type', 'status'],
        },
      },
      summary: {
        type: 'string',
        description:
          'One-sentence plain-language description of what was marked, shown to the user.',
      },
      needs_clarification: {
        type: 'boolean',
        description:
          'True only when the input is genuinely ambiguous and a reasonable default cannot be chosen.',
      },
      clarification_question: {
        type: 'string',
        description:
          'The specific question to ask the user. Required when needs_clarification is true.',
      },
    },
    required: ['entries', 'summary', 'needs_clarification'],
  },
};

function validateAndCoerceEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const status = e.status === 'memorized' || e.status === 'in_progress' ? e.status : null;
  if (!status) return null;

  if (e.type === 'juz') {
    const juz = Number(e.juz);
    if (!Number.isInteger(juz) || juz < 1 || juz > 30) return null;
    return { type: 'juz', juz, status };
  }
  if (e.type === 'surah') {
    const surah = Number(e.surah);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
    return { type: 'surah', surah, status };
  }
  if (e.type === 'page_range') {
    const startPage = Number(e.startPage);
    const endPage = Number(e.endPage);
    if (
      !Number.isInteger(startPage) ||
      !Number.isInteger(endPage) ||
      startPage < 1 ||
      endPage > 604 ||
      startPage > endPage
    ) {
      return null;
    }
    return { type: 'page_range', startPage, endPage, status };
  }
  return null;
}

export const parseMemorizationInput = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30, enforceAppCheck: true },
  async (request): Promise<ParseResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    await enforceRateLimit(request.auth.uid);

    const data = request.data as ParseRequest;
    const transcript = (data?.transcript ?? '').trim();
    if (!transcript) {
      throw new HttpsError('invalid-argument', 'transcript is required.');
    }
    if (transcript.length > 2000) {
      throw new HttpsError(
        'invalid-argument',
        'transcript must be 2000 characters or fewer.',
      );
    }

    const history = Array.isArray(data?.history) ? data.history : [];
    if (history.length > 6) {
      throw new HttpsError('invalid-argument', 'history is too long.');
    }
    for (const turn of history) {
      if (!turn || typeof turn !== 'object') {
        throw new HttpsError('invalid-argument', 'history turn must be an object.');
      }
      const role = (turn as { role?: unknown }).role;
      const content = (turn as { content?: unknown }).content;
      if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
        throw new HttpsError('invalid-argument', 'history turn has invalid role.');
      }
      if (typeof content !== 'string' || content.length === 0 || content.length > MAX_TURN_CHARS) {
        throw new HttpsError('invalid-argument', 'history turn content invalid.');
      }
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    const messages: Anthropic.MessageParam[] = [
      ...history.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      { role: 'user', content: transcript },
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [SET_MEMORIZATION_TOOL],
      tool_choice: { type: 'tool', name: 'set_memorization' },
      messages,
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUse) {
      throw new HttpsError(
        'internal',
        'Model did not return a structured response.',
      );
    }

    const input = toolUse.input as Record<string, unknown>;
    const needsClarification = Boolean(input.needs_clarification);
    const summary = typeof input.summary === 'string' ? input.summary : '';
    const clarificationQuestion =
      typeof input.clarification_question === 'string'
        ? input.clarification_question
        : null;

    const rawEntries = Array.isArray(input.entries) ? input.entries : [];
    const entries = rawEntries
      .map(validateAndCoerceEntry)
      .filter((e): e is Entry => e !== null);

    return {
      entries: needsClarification ? [] : entries,
      summary,
      needs_clarification: needsClarification,
      clarification_question: needsClarification ? clarificationQuestion : null,
    };
  },
);

/**
 * Delete the caller's account and all their data.
 * Required by Apple App Store guideline 5.1.1(v).
 *
 * Deletes (in order):
 *  1. users/{uid}/pages/* — page progress docs
 *  2. users/{uid}/sessions/* — session docs
 *  3. users/{uid}/_quota/* — App Check rate-limit counter
 *  4. users/{uid} — user profile doc
 *  5. Firebase Auth user
 *
 * Requires App Check to prevent abuse: an attacker with a stolen ID token
 * could otherwise use this to delete arbitrary accounts they happen to control.
 */
export const deleteUserAccount = onCall(
  { timeoutSeconds: 60, enforceAppCheck: true },
  async (request): Promise<{ ok: true }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;

    const userRef = adminDb.doc(`users/${uid}`);

    // Delete subcollections in chunks of 400 (Firestore batch limit is 500).
    async function deleteSubcollection(name: string) {
      while (true) {
        const snap = await userRef.collection(name).limit(400).get();
        if (snap.empty) return;
        const batch = adminDb.batch();
        for (const doc of snap.docs) batch.delete(doc.ref);
        await batch.commit();
      }
    }

    await deleteSubcollection('pages');
    await deleteSubcollection('sessions');
    await deleteSubcollection('_quota');

    await userRef.delete();

    try {
      await getAuth().deleteUser(uid);
    } catch (err) {
      // If auth deletion fails, the data is already gone — surface the error
      // so the client can prompt the user to retry the auth deletion.
      throw new HttpsError(
        'internal',
        `User data deleted but auth deletion failed: ${(err as Error).message}`,
      );
    }

    return { ok: true };
  },
);
