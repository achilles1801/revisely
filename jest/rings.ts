// A mark drawn inside a ring, a disc or a badge (a check, a glyph) sits in its centre. Layout tests can't see where a
// glyph lands, so this reads how it is placed instead.
//
// An icon is text. Given `absoluteFill` (or any absolute position) it fills its box and the glyph sits at the box's top
// start, cut by the ring: the Calendar's day card drew its done check there (Majd, Nov 26 2026: "check mark bug still
// here. make sure this doesn't happen anywhere in the app."). And an icon beside an in-flow ring (an Svg that isn't
// absolute) is pushed out of the ring, under it.

// A rendered element as the testing library returns it (`screen.UNSAFE_root` and what it holds).
interface Node {
  type: unknown;
  props: Record<string, any> | null;
  parent: Node | null;
  children: (Node | string)[];
}

/** A style prop as one object (arrays and nested arrays merged, falsy entries skipped). */
function flat(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flat(s) }), {});
  return typeof style === 'object' ? (style as Record<string, unknown>) : {};
}

const isHost = (n: Node) => typeof n.type === 'string';

/** The host views laid out directly inside `node` (through any components between them). */
function hostChildren(node: Node): Node[] {
  const out: Node[] = [];
  for (const c of node.children) {
    if (typeof c === 'string') continue;
    if (isHost(c)) out.push(c);
    else out.push(...hostChildren(c));
  }
  return out;
}

/** Whether `ancestor` is `node` or holds it. */
function holds(ancestor: Node, node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
}

/**
 * Every icon in `root` that sits in a square box (a ring, a disc, a badge: width equal to height) and isn't centred
 * in it, described ("checkmark in progress-ring: the icon is absolute"); empty when all are. Centred means: the icon
 * itself isn't absolute, the box centres its children both ways, everything else in the box is absolute (the ring
 * drawn behind), and the icon is no larger than the box. `Icon` is the icon component (Ionicons).
 */
export function offCentreMarks(root: Node, Icon: unknown): string[] {
  const icons: Node[] = [];
  const walk = (n: Node) => {
    if (n.type === Icon) icons.push(n);
    for (const c of n.children) if (typeof c !== 'string') walk(c);
  };
  walk(root);
  const problems: string[] = [];
  for (const icon of icons) {
    let box = icon.parent;
    while (box && !isHost(box)) box = box.parent;
    if (!box) continue;
    const s = flat(box.props?.style);
    const square = typeof s.width === 'number' && s.width === s.height;
    if (!square) continue;
    const name = `${icon.props?.name ?? 'icon'} in ${box.props?.testID ?? `a ${s.width}pt box`}`;
    if (flat(icon.props?.style).position === 'absolute') problems.push(`${name}: the icon is absolute`);
    if (s.alignItems !== 'center' || s.justifyContent !== 'center') problems.push(`${name}: the box doesn't centre it`);
    const others = hostChildren(box).filter((h) => !holds(icon, h));
    if (others.some((h) => flat(h.props?.style).position !== 'absolute')) problems.push(`${name}: something else in the box is in flow`);
    if (typeof icon.props?.size === 'number' && icon.props.size > (s.width as number)) problems.push(`${name}: the icon is larger than the box`);
  }
  return problems;
}

/** How many icons `root` holds in square boxes (so a test can say it looked at some). */
export function boxedMarks(root: Node, Icon: unknown): number {
  let n = 0;
  const walk = (node: Node) => {
    if (node.type === Icon) {
      let box = node.parent;
      while (box && !isHost(box)) box = box.parent;
      const s = flat(box?.props?.style);
      if (typeof s.width === 'number' && s.width === s.height) n += 1;
    }
    for (const c of node.children) if (typeof c !== 'string') walk(c);
  };
  walk(root);
  return n;
}
