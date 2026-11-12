/** What the recitation check service answers (scripts/recite-check/README.md, `v: 1`), and how it is worded. */

export type WordStatus = 'correct' | 'corrected' | 'wrong' | 'missed';
export type WordKind = 'skipped' | 'replaced' | 'lookalike' | 'sound' | 'order';
export type TajweedRule =
  | 'madd_munfasil'
  | 'madd_muttasil'
  | 'madd_aared'
  | 'madd_lazim'
  | 'madd_dropped'
  | 'qalqalah'
  | 'ghunnah'
  | 'ikhfa'
  | 'idgham'
  | 'idgham_no_ghunnah'
  | 'iqlab';

export interface CheckedWord {
  /** The app's word number (QuranWords). */
  w: number;
  status: WordStatus;
  kind?: WordKind;
  /** The look-alike word heard instead. */
  heard?: string;
  /** Seconds into the recording. */
  t?: [number, number];
}

export interface TajweedNote {
  w: number;
  rule: TajweedRule;
  /** A madd's counts as heard, and as it should be. */
  got?: number;
  expected?: number;
}

export interface CheckResult {
  v: 1;
  from: number;
  to: number;
  secs: number;
  words: CheckedWord[];
  extras: { after: number; t: number; trail: boolean }[];
  tajweed: TajweedNote[];
  letters: { w: number; slip: string }[] | null;
  engine?: string;
  kept?: boolean;
}

const STATUSES: WordStatus[] = ['correct', 'corrected', 'wrong', 'missed'];
const RULES: TajweedRule[] = [
  'madd_munfasil', 'madd_muttasil', 'madd_aared', 'madd_lazim', 'madd_dropped', 'qalqalah', 'ghunnah', 'ikhfa',
  'idgham', 'idgham_no_ghunnah', 'iqlab',
];
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** The service's answer, or null when it isn't one (anything unknown is dropped, not guessed). */
export function parseCheckResult(raw: unknown): CheckResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !isNum(r.from) || !isNum(r.to) || !Array.isArray(r.words)) return null;
  const words: CheckedWord[] = [];
  for (const x of r.words as Record<string, unknown>[]) {
    if (!x || !isNum(x.w) || !STATUSES.includes(x.status as WordStatus)) continue;
    const word: CheckedWord = { w: x.w, status: x.status as WordStatus };
    if (typeof x.kind === 'string') word.kind = x.kind as WordKind;
    if (typeof x.heard === 'string') word.heard = x.heard;
    if (Array.isArray(x.t) && isNum(x.t[0]) && isNum(x.t[1])) word.t = [x.t[0], x.t[1]];
    words.push(word);
  }
  const extras = (Array.isArray(r.extras) ? (r.extras as Record<string, unknown>[]) : [])
    .filter((e) => e && isNum(e.after))
    .map((e) => ({ after: e.after as number, t: isNum(e.t) ? e.t : 0, trail: e.trail === true }));
  const tajweed = (Array.isArray(r.tajweed) ? (r.tajweed as Record<string, unknown>[]) : [])
    .filter((n) => n && isNum(n.w) && RULES.includes(n.rule as TajweedRule))
    .map((n) => ({
      w: n.w as number,
      rule: n.rule as TajweedRule,
      ...(isNum(n.got) ? { got: n.got } : {}),
      ...(isNum(n.expected) ? { expected: n.expected } : {}),
    }));
  const letters = Array.isArray(r.letters)
    ? (r.letters as Record<string, unknown>[])
        .filter((l) => l && isNum(l.w) && typeof l.slip === 'string')
        .map((l) => ({ w: l.w as number, slip: l.slip as string }))
    : null;
  return {
    v: 1,
    from: r.from,
    to: r.to,
    secs: isNum(r.secs) ? r.secs : 0,
    words,
    extras,
    tajweed,
    letters,
    engine: typeof r.engine === 'string' ? r.engine : undefined,
    kept: typeof r.kept === 'boolean' ? r.kept : undefined,
  };
}

const counts = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? 'count' : 'counts'}`;

/** One line for a word that wasn't said right. */
export function describeWord(word: CheckedWord): string | null {
  if (word.status === 'missed') return 'Skipped';
  if (word.status !== 'wrong') return null;
  switch (word.kind) {
    case 'lookalike':
      return word.heard ? `Said as ${word.heard}` : 'Said as another word';
    case 'replaced':
      return 'Said differently';
    case 'order':
      return 'Out of order';
    default:
      return 'A sound said wrong';
  }
}

const RULE_NAMES: Record<TajweedRule, string> = {
  madd_munfasil: 'Madd munfasil',
  madd_muttasil: 'Madd muttasil',
  madd_aared: 'Madd ʿarid',
  madd_lazim: 'Madd lazim',
  madd_dropped: 'Madd',
  qalqalah: 'Qalqalah',
  ghunnah: 'Ghunnah',
  ikhfa: 'Ikhfa',
  idgham: 'Idgham',
  idgham_no_ghunnah: 'Idgham without ghunnah',
  iqlab: 'Iqlab',
};

/** "Madd munfasil · about 2 counts, set to 4", "Qalqalah · not heard". */
export function describeTajweed(note: TajweedNote): string {
  const name = RULE_NAMES[note.rule];
  switch (note.rule) {
    case 'madd_munfasil':
    case 'madd_muttasil':
    case 'madd_aared':
      return note.got != null && note.expected != null
        ? `${name} · about ${counts(note.got)}, set to ${note.expected}`
        : `${name} · not the length set`;
    case 'madd_lazim':
      return note.got != null ? `${name} · about ${counts(note.got)}, hold it for 6` : `${name} · hold it for 6`;
    case 'madd_dropped':
      return `${name} · not said`;
    case 'qalqalah':
      return `${name} · not heard`;
    case 'ghunnah':
      return `${name} · not held`;
    case 'ikhfa':
    case 'idgham':
    case 'idgham_no_ghunnah':
      return `${name} · the noon said clearly`;
    case 'iqlab':
      return `${name} · the noon said clearly, not as a meem`;
  }
}

/** "No mistakes heard", "2 words, 1 tajweed note". */
export function summary(r: CheckResult): string {
  const words = r.words.filter((w) => w.status === 'wrong' || w.status === 'missed').length + r.extras.length;
  const tajweed = r.tajweed.length;
  const letters = r.letters?.length ?? 0;
  const parts: string[] = [];
  if (words) parts.push(`${words} ${words === 1 ? 'word' : 'words'}`);
  if (letters) parts.push(`${letters} ${letters === 1 ? 'letter' : 'letters'}`);
  if (tajweed) parts.push(`${tajweed} tajweed ${tajweed === 1 ? 'note' : 'notes'}`);
  return parts.length ? parts.join(', ') : 'No mistakes heard';
}
