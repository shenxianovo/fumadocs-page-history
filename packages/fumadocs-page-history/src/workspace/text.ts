import { diffArrays } from 'diff';
import type { RootContent, PhrasingContent } from 'mdast';
import type { InlinePageChanges } from '../index';

type ParagraphChange = Omit<InlinePageChanges['paragraphs'][number], 'start'>;

const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
// Keep whitespace with the following word so repeated spaces cannot win the
// alignment over real words. Exact token equality preserves both source texts.
const words = (text: string) => {
  const result: string[] = [];
  let whitespace = '';
  for (const { segment } of wordSegmenter.segment(text)) {
    if (/^\s+$/u.test(segment)) whitespace += segment;
    else {
      result.push(whitespace + segment);
      whitespace = '';
    }
  }
  if (whitespace) result.push(whitespace);
  return result;
};
const significantLength = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, '').length;

function inlineSegments(changes: { value: string; added?: boolean; removed?: boolean }[]) {
  const result: ParagraphChange['segments'] = [];
  let old = '';
  let current = '';
  const flush = () => {
    if (old) result.push({ text: old, kind: 'removed' });
    if (current) result.push({ text: current, kind: 'added' });
    old = '';
    current = '';
  };
  for (const [i, change] of changes.entries()) {
    if (change.removed) old += change.value;
    else if (change.added) current += change.value;
    else if (
      (old || current) &&
      /^[\s\p{P}]+$/u.test(change.value) &&
      (changes[i + 1]?.added || changes[i + 1]?.removed)
    ) {
      // Shared spaces/punctuation inside a replacement are not useful anchors.
      // Keep the old/new phrases together instead of alternating every word.
      old += change.value;
      current += change.value;
    } else {
      flush();
      result.push({ text: change.value, kind: 'same' });
    }
  }
  flush();
  return result;
}

/** Compare an already paired paragraph; layout never decides which blocks match. */
export function compareParagraphs(
  previous: RootContent,
  current: RootContent,
): ParagraphChange | undefined {
  if (
    previous.type === 'listItem' &&
    current.type === 'listItem' &&
    previous.checked !== current.checked
  )
    return;
  const oldText = paragraphText(previous);
  const text = paragraphText(current);
  if (oldText === undefined || text === undefined) return;
  if (oldText === text) {
    // Renumbering an ordered list does not change an item's visible text.
    if (
      previous.type === 'listItem' &&
      current.type === 'listItem' &&
      JSON.stringify(previous, withoutPosition) === JSON.stringify(current, withoutPosition)
    )
      return { text, layout: 'inline', segments: [{ text, kind: 'same' }] };
    const segments = linkTargetSegments(previous, current);
    // Unsupported formatting-only changes retain complete blocks.
    return segments ? { text, layout: 'inline', segments } : undefined;
  }
  const changes = diffArrays(words(oldText), words(text), {
    maxEditLength: 2000,
    timeout: 200,
  })?.map((part) => ({ ...part, value: part.value.join('') }));
  if (!changes) return;
  const commonLength = changes.reduce(
    (length, part) => length + (part.added || part.removed ? 0 : significantLength(part.value)),
    0,
  );
  const replacement = changes.some((part) => part.added) && changes.some((part) => part.removed);
  // Layout only: keep expansions inline, but show substantial rewrites as full
  // revisions. The shorter side retains the original context of long expansions.
  const inline =
    commonLength > 0 &&
    (!replacement ||
      commonLength >= Math.min(significantLength(oldText), significantLength(text)) / 2);
  // Even a complete rewrite keeps word results for emphasis in both revisions.
  return { text, layout: inline ? 'inline' : 'separate', segments: inlineSegments(changes) };
}

const withoutPosition = (key: string, value: unknown) => (key === 'position' ? undefined : value);

/** Preserve a paragraph once when its only visible-source change is link targets. */
function linkTargetSegments(previous: RootContent, current: RootContent) {
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
  const segments: ParagraphChange['segments'] = [];
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
  if (node.type === 'listItem') {
    return node.children.length === 1 ? paragraphText(node.children[0]) : undefined;
  }
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
