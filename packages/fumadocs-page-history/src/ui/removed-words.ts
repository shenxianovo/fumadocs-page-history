import type { InlinePageChanges } from '../index';

type Segments = InlinePageChanges['paragraphs'][number]['segments'];
interface Node {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

/** Decorate the inert Markdown tree without changing links, emphasis, or code. */
export function highlightRemovedWords(segments: Segments) {
  let offset = 0;
  const ranges = segments.flatMap((segment) => {
    if (segment.kind === 'added') return [];
    const start = offset;
    offset += segment.text.length;
    return segment.kind === 'removed' ? [{ start, end: offset }] : [];
  });
  const previous = segments
    .filter((segment) => segment.kind !== 'added')
    .map((segment) => segment.text)
    .join('');
  return () => (tree: Node) => {
    const text = (node: Node): string =>
      node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(text).join('');
    // Only apply offsets when Markdown rendering produced the expected text.
    if (text(tree) !== previous) return;
    let cursor = 0;
    function visit(parent: Node) {
      parent.children = parent.children?.flatMap((node): Node[] => {
        if (node.type !== 'text' || node.value === undefined) {
          if (node.children) visit(node);
          return [node];
        }
        const value = node.value;
        const start = cursor;
        const end = start + value.length;
        cursor = end;
        let consumed = start;
        const children: Node[] = [];
        for (const range of ranges) {
          const from = Math.max(start, range.start);
          const to = Math.min(end, range.end);
          if (to <= from) continue;
          if (from > consumed)
            children.push({ type: 'text', value: value.slice(consumed - start, from - start) });
          children.push({
            type: 'element',
            tagName: 'del',
            properties: { className: ['fgc-inline-text'], 'data-change': 'removed' },
            children: [{ type: 'text', value: value.slice(from - start, to - start) }],
          });
          consumed = to;
        }
        if (consumed < end) children.push({ type: 'text', value: value.slice(consumed - start) });
        return children;
      });
    }
    visit(tree);
  };
}
