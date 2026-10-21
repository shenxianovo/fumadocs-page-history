import type { RootContent, PhrasingContent } from 'mdast';
import type { InlinePageChanges } from '../index';

/** Preserve a paragraph once when its only visible-source change is link targets. */
export function linkTargetSegments(previous: RootContent, current: RootContent) {
  const structure = (node: RootContent) =>
    JSON.stringify(node, (key, value) => (key === 'position' || key === 'url' ? undefined : value));
  if (structure(previous) !== structure(current)) return;
  const text = paragraphText(current);
  if (text === undefined) return;
  const links = (node: RootContent) => {
    let offset = 0;
    const result: { start: number; end: number; url: string }[] = [];
    function visit(child: RootContent | PhrasingContent) {
      if (child.type === 'text' || child.type === 'inlineCode') offset += child.value.length;
      else if ('children' in child) {
        const start = offset;
        child.children.forEach(visit);
        if (child.type === 'link' && offset > start)
          result.push({ start, end: offset, url: child.url });
      }
    }
    visit(node);
    return result;
  };
  const before = links(previous);
  const changed = links(current).flatMap((link, index) => {
    const old = before[index];
    return old && old.start === link.start && old.end === link.end && old.url !== link.url
      ? [{ ...link, previous: old.url }]
      : [];
  });
  if (!changed.length) return;
  const segments: InlinePageChanges['paragraphs'][number]['segments'] = [];
  let offset = 0;
  for (const link of changed) {
    if (link.start > offset) segments.push({ text: text.slice(offset, link.start), kind: 'same' });
    segments.push({
      text: text.slice(link.start, link.end),
      kind: 'same',
      linkTarget: { previous: link.previous, current: link.url },
    });
    offset = link.end;
  }
  if (offset < text.length) segments.push({ text: text.slice(offset), kind: 'same' });
  return segments;
}

/** Only inline Markdown we can decorate without replacing live MDX components. */
export function paragraphText(node: RootContent): string | undefined {
  if (node.type !== 'paragraph') return;
  function text(value: {
    type: string;
    value?: unknown;
    children?: unknown[];
  }): string | undefined {
    if (value.type === 'text' || value.type === 'inlineCode') return String(value.value);
    if (!['paragraph', 'emphasis', 'strong', 'link'].includes(value.type)) return;
    const children = (value.children ?? []).map((child) =>
      text(child as Parameters<typeof text>[0]),
    );
    return children.some((child) => child === undefined) ? undefined : children.join('');
  }
  return text(node);
}
