// A log note can hang off one item of its day (Activity spec section 2, C4): a revision,
// a memorization, a timed read, or a Recite take, a spot test included ('take', its id: Majd, Nov 25 2026, "add notes
// under spot test like how under revised is an option"). The tag is stored as a short string (the rules take any up to
// 100 characters); an app that doesn't know a kind shows the note in the Notes block.

export type TagKind = 'revision' | 'memorization' | 'read' | 'take';
const KINDS: readonly string[] = ['revision', 'memorization', 'read', 'take'];

export function tagFor(kind: TagKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseTag(tag: string | null | undefined): { kind: TagKind; id: string } | null {
  if (!tag) return null;
  const i = tag.indexOf(':');
  const kind = tag.slice(0, i);
  if (i <= 0 || !KINDS.includes(kind)) return null;
  return { kind: kind as TagKind, id: tag.slice(i + 1) };
}
