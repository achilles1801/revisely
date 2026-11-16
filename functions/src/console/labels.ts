/**
 * Recitation labels (Revisely Console's /label page; adminConsole labels.*; permission recite.label: owners, admins and
 * labellers).
 *
 * Majd and the people he lets in (his Quran teacher: the `labeller` role) mark real recitation mistakes, one clip at a
 * time, so the mistake checker has real labels to be measured and trained on (Majd, Nov 15 2026: "if the issue is those
 * recitations don't say what is right or wrong then i can help with that"). A clip is a short recording, the passage's
 * words and the checker's marks on it. The labeller says of each mark whether it is a mistake, and taps any word the
 * checker missed. The lab exports the labels (functions/scripts/recite-labels.js).
 *
 * Several labellers per clip: each label is `reciteLabelClips/{id}/labels/{uid}`, so two people's marks can be compared.
 * A clip is labelled once by default (whoever reaches it first); `queue: [uid]` on a clip sends it to that labeller too
 * (the script's `queue`), which is how some clips get a second label on purpose. Every saved label goes to the console's
 * audit log (consoleAudit, kind `label`) with each tap that made it.
 *
 * Only in revisely-dev (LABEL_PROJECTS): the clips, their audio and the labels never leave it, and the production
 * project answers nothing. Only clips a person may listen to are added (the script refuses anything else): licensed
 * sets, Majd's own recordings and recordings gathered with the reciter's permission. Never the /record takes or anyone's
 * Dev takes (recite-tests/): their consent says nobody listens.
 *
 * Firestore `reciteLabelClips` (and its labels) and Storage `recite-labels/` are closed to clients (firestore.rules' and
 * storage.rules' catch-alls); the page reads and writes them through these calls only.
 */
import { AggregateField, FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { ConsoleError, StaffCaller, requirePermission } from './roles';
import { CONSOLE_AUDIT } from './staff';

export const CLIPS = 'reciteLabelClips';
export const LABELS = 'labels';
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
/** A word the checker didn't mark, as the labeller heard it (`added`: an extra word after it). */
export const WORD_LABELS = ['word', 'skipped', 'added', 'harakat', 'letter', 'unclear'] as const;
export type WordLabel = (typeof WORD_LABELS)[number];
/** Why a whole clip was set aside (unusable). */
export const SKIP_REASONS = ['audio', 'not-this-passage', 'other'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
/** The clip as a whole, worked out from the answers. */
export type ClipVerdict = 'fine' | 'mistakes' | 'unusable';

/** A labeller's own words, when the choices aren't enough (Majd, Nov 16 2026: "a text box for listener to put feedback
 * for each word (optional)"): on a word, or on the whole clip. Any language. */
export const NOTE_MAX = 300;

/** One tap, as the page records it, for the audit log. `t`: ms since the clip was shown. */
export interface LabelAction {
  t: number;
  /** a mark's answer, a word's label, a word's label taken back, every open mark set to "not a mistake", undo, skip, a
   * word's note (v: added, changed or cleared), the clip's note (same) */
  a: 'mark' | 'word' | 'clear' | 'fine' | 'undo' | 'skip' | 'note' | 'clipnote';
  id?: string;
  w?: number;
  v?: string;
  /** what it was before (mark and word) */
  was?: string | null;
}
const ACTION_KINDS = ['mark', 'word', 'clear', 'fine', 'undo', 'skip', 'note', 'clipnote'];
const MAX_ACTIONS = 300;

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
  by: { uid: string; email: string | null; role: string | null };
  at: number;
  /** time on the clip, from shown to saved */
  ms: number;
  marks: Record<string, Verdict>;
  /** keyed by word number */
  words: Record<string, WordLabel>;
  skip?: SkipReason;
  clip: ClipVerdict;
  /** notes on words, keyed by word number (optional) */
  wordNotes?: Record<string, string>;
  /** a note on the whole clip (optional) */
  note?: string;
  /** mark answers + word labels, for the hourly rate */
  answers: number;
  actions: LabelAction[];
  /** times this labeller has saved this clip (a second save replaces the first) */
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
  /** open until someone labels it; done or skipped after the first label */
  status: 'open' | 'done' | 'skipped';
  /** who has labelled it */
  labelledBy?: string[];
  /** labellers it is sent to as well (a second label on purpose); each leaves the list when they label it */
  queue?: string[];
  createdAt: number;
  labelledAt?: number;
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

const ms = (v: unknown): number | undefined => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : undefined);

/** What the page gets: the clip without its storage path, the caller's own label if any, and the audio. */
async function forPage(deps: LabelDeps, id: string, c: Clip, mine: Partial<Label> | null) {
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
      label: mine
        ? { marks: mine.marks ?? {}, words: mine.words ?? {}, wordNotes: mine.wordNotes ?? {}, note: mine.note ?? '', skip: mine.skip ?? null, at: ms(mine.at) ?? null }
        : null,
    },
    audio: { type: c.audio.type, data: audio.toString('base64') },
  };
}

/** Checks a label against its clip; throws what the page shows. */
export function checkLabel(
  c: { marks: ClipMark[]; words: ClipWord[] },
  data: Record<string, unknown>,
): Pick<Label, 'marks' | 'words' | 'clip' | 'answers' | 'actions'> & { skip?: SkipReason; wordNotes?: Record<string, string>; note?: string } {
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
  const rawNotes = (data.wordNotes && typeof data.wordNotes === 'object' ? data.wordNotes : {}) as Record<string, unknown>;
  const wordNotes: Record<string, string> = {};
  for (const [w, v] of Object.entries(rawNotes)) {
    if (!ws.has(w)) throw new ConsoleError('invalid-argument', 'A note is on a word that isn’t in this clip. Reload it.');
    const text = noteText(v);
    if (text) wordNotes[w] = text;
  }
  const note = noteText(data.note);
  const actions = checkActions(data.actions);
  const clip: ClipVerdict = skip ? 'unusable' : Object.values(marks).includes('yes') || Object.keys(words).length ? 'mistakes' : 'fine';
  const answers = Object.keys(marks).length + Object.keys(words).length;
  return {
    marks,
    words,
    ...(skip ? { skip } : {}),
    ...(Object.keys(wordNotes).length ? { wordNotes } : {}),
    ...(note ? { note } : {}),
    clip,
    answers,
    actions,
  };
}

/** A note as kept: trimmed, control characters out (newlines become spaces), at most NOTE_MAX characters. */
export function noteText(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v !== 'string') throw new ConsoleError('invalid-argument', 'A note has to be text.');
  // eslint-disable-next-line no-control-regex
  const text = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if ([...text].length > NOTE_MAX) throw new ConsoleError('invalid-argument', `A note is longer than ${NOTE_MAX} characters.`);
  return text;
}

/** The page's record of taps, kept to the fields the audit log shows (and at most MAX_ACTIONS of them). */
export function checkActions(raw: unknown): LabelAction[] {
  if (!Array.isArray(raw)) return [];
  const out: LabelAction[] = [];
  for (const x of raw.slice(0, MAX_ACTIONS)) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (typeof r.a !== 'string' || !ACTION_KINDS.includes(r.a)) continue;
    const a: LabelAction = { t: typeof r.t === 'number' && Number.isFinite(r.t) ? Math.max(0, Math.round(r.t)) : 0, a: r.a as LabelAction['a'] };
    if (typeof r.id === 'string' && r.id.length <= 120) a.id = r.id;
    if (typeof r.w === 'number' && Number.isInteger(r.w)) a.w = r.w;
    if (typeof r.v === 'string' && r.v.length <= 40) a.v = r.v;
    if (r.was === null || (typeof r.was === 'string' && r.was.length <= 40)) a.was = r.was as string | null;
    out.push(a);
  }
  return out;
}

export interface LabelAudit {
  id: string;
  at: number;
  clip: string;
  batch: string;
  where: string;
  by: { uid: string; email: string | null; role: string | null };
  result: ClipVerdict;
  marks: { yes: number; no: number; unsure: number };
  missed: { w: number; label: WordLabel; text: string }[];
  /** notes on words (with the word's text) and on the clip */
  notes: { w: number; text: string; note: string }[];
  note: string | null;
  skip: SkipReason | null;
  relabel: boolean;
  ms: number;
  actions: LabelAction[];
}

export async function handleLabels(caller: StaffCaller, action: string, data: Record<string, unknown>, deps: LabelDeps): Promise<unknown> {
  requirePermission(caller, 'recite.label');
  need(deps);
  // Read only once the arguments are checked.
  const clips = () => deps.db.collection(CLIPS);
  const mineOf = async (id: string) => {
    const d = await clips().doc(id).collection(LABELS).doc(caller.uid).get();
    return d.exists ? (d.data() as Partial<Label>) : null;
  };

  switch (action) {
    case 'labels.next': {
      // The page holds the clip on screen and the one after it (and any still being sent); it names them so the same
      // one isn't sent twice. Clips sent to this labeller come first, then clips nobody has labelled.
      const held = Array.isArray(data.held) ? data.held.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
      const n = held.length + 1;
      const queued = await clips().where('queue', 'array-contains', caller.uid).orderBy('order').limit(n).get();
      let doc = queued.docs.find((d) => !held.includes(d.id));
      if (!doc) {
        const open = await clips().where('status', '==', 'open').orderBy('order').limit(n).get();
        doc = open.docs.find((d) => !held.includes(d.id));
      }
      if (!doc) return { clip: null };
      return forPage(deps, doc.id, doc.data() as Clip, await mineOf(doc.id));
    }

    case 'labels.get': {
      const id = idArg(data);
      const doc = await clips().doc(id).get();
      if (!doc.exists) throw new ConsoleError('not-found', 'That clip is gone.');
      return forPage(deps, id, doc.data() as Clip, await mineOf(id));
    }

    case 'labels.save': {
      const id = idArg(data);
      const spent = typeof data.ms === 'number' && Number.isFinite(data.ms) ? Math.max(0, Math.min(Math.round(data.ms), 3_600_000)) : 0;
      const ref = clips().doc(id);
      const labelRef = ref.collection(LABELS).doc(caller.uid);
      const auditRef = deps.db.collection(CONSOLE_AUDIT).doc();
      return deps.db.runTransaction(async (tx) => {
        const [doc, prev] = await Promise.all([tx.get(ref), tx.get(labelRef)]);
        if (!doc.exists) throw new ConsoleError('not-found', 'That clip is gone.');
        const c = doc.data() as Clip;
        const checked = checkLabel({ marks: marksOf(c), words: c.words }, data);
        const now = deps.now();
        const by = { uid: caller.uid, email: caller.email, role: caller.role };
        const label: Label = { ...checked, by, at: now, ms: spent, n: ((prev.data() as Partial<Label> | undefined)?.n ?? 0) + 1 };
        tx.set(labelRef, { ...label, at: Timestamp.fromMillis(now) });
        tx.update(ref, {
          status: c.status === 'open' ? (checked.skip ? 'skipped' : 'done') : c.status,
          labelledBy: FieldValue.arrayUnion(caller.uid),
          queue: FieldValue.arrayRemove(caller.uid),
          labelledAt: now,
        });
        const counts = { yes: 0, no: 0, unsure: 0 };
        for (const v of Object.values(checked.marks)) counts[v] += 1;
        const text = new Map(c.words.map((w) => [String(w.w), w.t]));
        const first = c.words[0];
        const last = c.words[c.words.length - 1];
        tx.set(auditRef, {
          kind: 'label',
          at: Timestamp.fromMillis(now),
          clip: id,
          batch: c.batch,
          where: first ? `${first.s}:${first.a}${last && (last.s !== first.s || last.a !== first.a) ? `–${last.s !== first.s ? `${last.s}:` : ''}${last.a}` : ''}` : '',
          by,
          result: checked.clip,
          marks: counts,
          missed: Object.entries(checked.words).map(([w, l]) => ({ w: +w, label: l, text: text.get(w) ?? '' })),
          notes: Object.entries(checked.wordNotes ?? {}).map(([w, n]) => ({ w: +w, text: text.get(w) ?? '', note: n })),
          note: checked.note ?? null,
          skip: checked.skip ?? null,
          relabel: prev.exists,
          ms: spent,
          actions: checked.actions,
        });
        return { saved: true, result: checked.clip };
      });
    }

    case 'labels.stats': {
      // `since`: the start of the labeller's day, from the page (their time zone).
      const since = typeof data.since === 'number' && Number.isFinite(data.since) ? data.since : deps.now() - 86_400_000;
      const [total, open, queued, today] = await Promise.all([
        clips().count().get(),
        clips().where('status', '==', 'open').count().get(),
        clips().where('queue', 'array-contains', caller.uid).count().get(),
        deps.db
          .collectionGroup(LABELS)
          .where('by.uid', '==', caller.uid)
          .where('at', '>=', Timestamp.fromMillis(since))
          .aggregate({ clips: AggregateField.count(), answers: AggregateField.sum('answers'), ms: AggregateField.sum('ms') })
          .get(),
      ]);
      const t = today.data();
      const all = total.data().count;
      const left = open.data().count;
      return {
        total: all,
        labelled: all - left,
        open: left,
        queued: queued.data().count,
        today: { clips: t.clips, answers: t.answers ?? 0, ms: t.ms ?? 0 },
      };
    }

    default:
      throw new ConsoleError('invalid-argument', 'Unknown action.');
  }
}

/** The label entries of the audit log, newest first (adminConsole audit.labels; audit.read). */
export async function labelAuditPage(db: Firestore, opts: { limit?: number; cursor?: unknown }): Promise<{ rows: LabelAudit[]; next: string | null }> {
  const limit = Math.min(100, Math.max(1, Math.floor(typeof opts.limit === 'number' ? opts.limit : 50)));
  let q = db.collection(CONSOLE_AUDIT).where('kind', '==', 'label').orderBy('at', 'desc');
  if (typeof opts.cursor === 'string' && /^\d{1,15}$/.test(opts.cursor)) q = q.startAfter(Timestamp.fromMillis(Number(opts.cursor)));
  const snap = await q.limit(limit + 1).get();
  const rows = snap.docs.slice(0, limit).map((d) => {
    const x = d.data();
    return { ...(x as Omit<LabelAudit, 'id' | 'at'>), id: d.id, at: ms(x.at) ?? 0 } as LabelAudit;
  });
  const last = rows[rows.length - 1];
  return { rows, next: snap.docs.length > limit && last ? String(last.at) : null };
}
