// A rendered element as the testing library returns it.
interface Node {
  type: unknown;
  props: Record<string, any> | null;
  parent: Node | null;
}

/**
 * Whether a scroll view can take a drag on iOS: no view above it may handle
 * touches itself (a Pressable, a PanResponder). On the new architecture a scroll
 * view under a view holding the touch doesn't scroll; layout tests can't see that.
 * Returns the first such ancestor's testID (or 'unnamed'), or null if there is none.
 */
export function touchHandlingAncestor(scrollView: Node): string | null {
  let node = scrollView.parent;
  while (node) {
    const p = node.props ?? {};
    if (typeof node.type === 'string' && (p.onStartShouldSetResponder || p.onResponderGrant || p.onMoveShouldSetResponder)) {
      return p.testID ?? 'unnamed';
    }
    node = node.parent;
  }
  return null;
}

/** A style prop as one object (arrays and nested arrays merged, falsy entries skipped). */
function flat(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flat(s) }), {});
  return typeof style === 'object' ? (style as Record<string, unknown>) : {};
}

/**
 * The flex direction of the nearest view laid out around `node` (its host parent): 'row' or
 * 'column' (React Native's default). A view that is `flex: 1` (v2/WheelPicker) shares a ROW's width;
 * in a column with no fixed height its basis of 0 collapses it to nothing, which layout tests can't
 * see either (the Surah / Juz picker's wheel, Nov 2026).
 */
export function parentFlexDirection(node: Node): 'row' | 'column' {
  let p = node.parent;
  while (p && typeof p.type !== 'string') p = p.parent;
  return flat(p?.props?.style).flexDirection === 'row' ? 'row' : 'column';
}
