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
