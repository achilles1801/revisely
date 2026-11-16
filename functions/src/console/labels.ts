/**
 * Recitation labels (Revisely Console's /label page; adminConsole labels.*; permission recite.label, owners and admins).
 *
 * Majd marks real recitation mistakes, one clip at a time, so the mistake checker has real labels to be measured and
 * trained on (Nov 15 2026: "if the issue is those recitations don't say what is right or wrong then i can help with
 * that"). A clip is a short recording, the passage's words and the checker's marks on it. He says of each mark whether
 * it is a mistake, and taps any word the checker missed. The lab exports the labels (functions/scripts/recite-labels.js).
 *
 * Only in revisely-dev (LABEL_PROJECTS): the clips, their audio and the labels never leave it, and the production
 * project answers nothing. Only clips a person may listen to are added (the script refuses anything else): licensed
 * sets, Majd's own recordings and recordings gathered with the reciter's permission. Never the /record takes or anyone's
 * Dev takes (recite-tests/): their consent says nobody listens.
 *
 * Firestore `reciteLabelClips/{id}` and Storage `recite-labels/` are closed to clients (firestore.rules' and
 * storage.rules' catch-alls); the page reads them through these calls only.
 */
import { AggregateField, Firestore } from 'firebase-admin/firestore';
import { ConsoleError, StaffCaller, requirePermission } from './roles';

export const CLIPS = 'reciteLabelClips';
export const AUDIO_PREFIX = 'recite-labels/';
/** The projects with the labelling page. Production has none. */
export const LABEL_PROJECTS = ['revisely-dev', 'demo-revisely'];

/** Where a clip comes from: only these may be listened to. */
export const SOURCE_KINDS = ['licensed', 'own', 'permission'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const MARK_KINDS = ['word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'] as const;
/** A checker mark: is it a mistake? `unsure`: can't tell from the recording. */
export const VERDICTS = ['yes', 'no', 'unsure'] as const;
export type Verdict = (typeof VERDICTS)[number];
/** A word the checker didn't mark, as the labeller heard it. `fine` takes a word's label back. */
export const WORD_LABELS = ['word', 'skipped', 'added', 'harakat', 'unclear'] as const;
export type WordLabel = (typeof WORD_LABELS)[number];
/** Why a whole clip was skipped. */
export const SKIP_REASONS = ['audio', 'not-this-passage', 'other'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface ClipWord {
  /** the app's word number (QuranWords) */
  w: number;
  /** the word in Uthmani script */
  t: string;
  s: number;
  a: number;
}

/** A checker mark as the checker sent it (recite-contract.md, "A mark"); the page reads what it knows. */
export interface ClipMark {
  id: string;
  w: number;
  kind: (typeof MARK_KINDS)[number];
  sure?: 'clear' | 'likely';
  t?: [number, number];
  [k: string]: unknown;
}

export interface Label {
  by: { uid: string; email: string | null };
  at: number;
  /** time on the clip, from shown to saved */
  ms: number;
  marks: Record<string, Verdict>;
  /** keyed by word number */
  words: Record<string, WordLabel>;
  skip?: SkipReason;
  /** times this clip has been labelled (a second save replaces the first) */
  n: number;
}

export interface Clip {
  batch: string;
  order: number;
  source: { kind: SourceKind; name: string };
  audio: { path: string; type: string; seconds: number };
  words: ClipWord[];
  /** the checker's marks as JSON text, exactly as the lab gave them (Firestore holds no arrays of arrays, which `into`
   * has) */
  marks: string;
  /** when each word was said, where known (seconds) */
  times?: { w: number; a: number; b: number }[];
  status: 'open' | 'done' | 'skipped';
  createdAt: number;
  label?: Label;
  labelledAt?: number;
  /** how many answers the label holds (mark verdicts + word labels), for the hourly rate */
  answers?: number;
}

export interface LabelDeps {
  db: Firestore;
  /** the project has the labelling page (LABEL_PROJECTS) */
  open: boolean;
  /** a clip's audio from the bucket */
  audio(path: string): Promise<Buffer>;
  now(): number;
}

const ID = /^[A-Za-z0-9_.-]{1,120}$/;

function need(deps: LabelDeps): void {
  if (!deps.open) throw new ConsoleError('failed-precondition', 'Labelling isn’t in this project.');
}

function idArg(data: Record<string, unknown>): string {
  const id = data.id;
  if (typeof id !== 'string' || !ID.test(id)) throw new ConsoleError('invalid-argument', 'That isn’t a clip.');
  return id;
}

export function marksOf(c: Pick<Clip, 'marks'>): ClipMark[] {
  try {
    const marks = JSON.parse(c.marks);
    return Array.isArray(marks) ? marks : [];
  } catch {
    return [];
  }
}

/** What the page gets: the clip without its storage path, and the audio. */
async function forPage(deps: LabelDeps, id: string, c: Clip) {
  const audio = await deps.audio(c.audio.path);
  return {
    clip: {
      id,
      batch: c.batch,
      source: c.source,
      seconds: c.audio.seconds,
      words: c.words,
      marks: marksOf(c),
      times: (c.times ?? []).map((t) => [t.w, t.a, t.b]),
      status: c.status,
      label: c.label ? { marks: c.label.marks, words: c.label.words, skip: c.label.skip ?? null, at: c.label.at } : null,
    },
    audio: { type: c.audio.type, data: audio.toString('base64') },
  };
}

/** Checks a label against its clip; throws what the page shows. */
export function checkLabel(c: { marks: ClipMark[]; words: ClipWord[] }, data: Record<string, unknown>): Omit<Label, 'by' | 'at' | 'ms' | 'n'> {
  if (data.skip != null && !(SKIP_REASONS as readonly unknown[]).includes(data.skip)) throw new ConsoleError('invalid-argument', 'That isn’t a reason to skip.');
  const skip = data.skip == null ? undefined : (data.skip as SkipReason);
  const rawMarks = (data.marks && typeof data.marks === 'object' ? data.marks : {}) as Record<string, unknown>;
  const rawWords = (data.words && typeof data.words === 'object' ? data.words : {}) as Record<string, unknown>;
  const ids = new Set(c.marks.map((m) => m.id));
  const ws = new Set(c.words.map((w) => String(w.w)));
  const marks: Record<string, Verdict> = {};
  for (const [id, v] of Object.entries(rawMarks)) {
    if (!ids.has(id)) throw new ConsoleError('invalid-argument', 'A mark isn’t on this clip. Reload it.');
    if (!(VERDICTS as readonly unknown[]).includes(v)) throw new ConsoleError('invalid-argument', 'A mark’s answer isn’t one of yes, no or can’t tell.');
    marks[id] = v as Verdict;
  }
  const words: Record<string, WordLabel> = {};
  for (const [w, v] of Object.entries(rawWords)) {
    if (!ws.has(w)) throw new ConsoleError('invalid-argument', 'A word isn’t in this clip. Reload it.');
    if (!(WORD_LABELS as readonly unknown[]).includes(v)) throw new ConsoleError('invalid-argument', 'A word’s label isn’t one the page offers.');
    words[w] = v as WordLabel;
  }
  if (!skip) {
    const left = c.marks.filter((m) => !(m.id in marks)).length;
    if (left) throw new ConsoleError('invalid-argument', left === 1 ? 'One mark has no answer yet.' : `${left} marks have no answer yet.`);
  }
  return skip ? { marks, words, skip } : { marks, words };
}

export async function handleLabels(caller: StaffCaller, action: string, data: Record<string, unknown>, deps: LabelDeps): Promise<unknown> {
  requirePermission(caller, 'recite.label');
  need(deps);
  // Read only once the arguments are checked.
  const clips = () => deps.db.collection(CLIPS);

  switch (action) {
    case 'labels.next': {
      // The page holds the clip on screen and the one after it; it names them so the same one isn't sent twice.
      const held = Array.isArray(data.held) ? data.held.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
      const snap = await clips().where('status', '==', 'open').orderBy('order').limit(held.length + 1).get();
      const doc = snap.docs.find((d) => !held.includes(d.id));
      if (!doc) return { clip: null };
      return forPage(deps, doc.id, doc.data() as Clip);
    }

    case 'labels.get': {
      const id = idArg(data);
      const doc = await clips().doc(id).get();
      if (!doc.exists) throw new ConsoleError('not-found', 'That clip is gone.');
      return forPage(deps, id, doc.data() as Clip);
    }

    case 'labels.save': {
      const id = idArg(data);
      const ms = typeof data.ms === 'number' && Number.isFinite(data.ms) ? Math.max(0, Math.min(Math.round(data.ms), 3_600_000)) : 0;
      const ref = clips().doc(id);
      return deps.db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists) throw new ConsoleError('not-found', 'That clip is gone.');
        const c = doc.data() as Clip;
        const checked = checkLabel({ marks: marksOf(c), words: c.words }, data);
        const now = deps.now();
        const label: Label = { ...checked, by: { uid: caller.uid, email: caller.email }, at: now, ms, n: (c.label?.n ?? 0) + 1 };
        tx.update(ref, {
          label,
          labelledAt: now,
          status: checked.skip ? 'skipped' : 'done',
          answers: Object.keys(checked.marks).length + Object.keys(checked.words).length,
        });
        return { saved: true, status: checked.skip ? 'skipped' : 'done' };
      });
    }

    case 'labels.stats': {
      // `since`: the start of the labeller's day, from the page (their time zone).
      const since = typeof data.since === 'number' && Number.isFinite(data.since) ? data.since : deps.now() - 86_400_000;
      const [open, done, skipped, today] = await Promise.all([
        clips().where('status', '==', 'open').count().get(),
        clips().where('status', '==', 'done').count().get(),
        clips().where('status', '==', 'skipped').count().get(),
        clips()
          .where('labelledAt', '>=', since)
          .aggregate({ clips: AggregateField.count(), answers: AggregateField.sum('answers'), ms: AggregateField.sum('label.ms') })
          .get(),
      ]);
      const t = today.data();
      return {
        open: open.data().count,
        done: done.data().count,
        skipped: skipped.data().count,
        today: { clips: t.clips, answers: t.answers ?? 0, ms: t.ms ?? 0 },
      };
    }

    default:
      throw new ConsoleError('invalid-argument', 'Unknown action.');
  }
}
