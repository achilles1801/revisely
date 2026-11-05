// A log note can hang off one item of its day (Activity spec section 2, C4): a revision,
// a memorization, or a timed read. The tag is stored as a short string.

export type TagKind = 'revision' | 'memorization' | 'read';

export function tagFor(kind: TagKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseTag(tag: string | null | undefined): { kind: TagKind; id: string } | null {
  if (!tag) return null;
  const i = tag.indexOf(':');
  const kind = tag.slice(0, i);
  if (i <= 0 || (kind !== 'revision' && kind !== 'memorization' && kind !== 'read')) return null;
  return { kind, id: tag.slice(i + 1) };
}
