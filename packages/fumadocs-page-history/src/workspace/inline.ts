import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { createPageDiff } from '../git/diff';
import type { PageChangesResult, SourceRange } from '../index';
import { diffArrays } from 'diff';
import { paragraphText, linkTargetSegments } from './text';

const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
const words = (text: string) => Array.from(wordSegmenter.segment(text), (part) => part.segment);
const significantLength = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, '').length;

function inlineSegments(changes: { value: string; added?: boolean; removed?: boolean }[]) {
  const result: import('../index').InlinePageChanges['paragraphs'][number]['segments'] = [];
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
      !/[\p{L}\p{N}]/u.test(change.value) &&
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

export const sourceHash = (source: string) => createHash('sha256').update(source).digest('hex');

function frontmatter(source: string) {
  return source.match(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? '';
}

/** Expand removals to complete Markdown blocks, preserving their original position. */
export function buildInlineChanges(
  previous: string,
  current: string,
  sourcePath: string,
): PageChangesResult {
  const diff = createPageDiff(previous, current, { sourcePath, previousPath: sourcePath });
  if (diff.unavailable) return { changed: true, unavailable: diff.unavailable };
  if (!diff.hunks.length) return { changed: false };
  const added: SourceRange[] = [];
  const removedLines: { oldLine: number; beforeLine: number }[] = [];
  for (const hunk of diff.hunks) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    let runStart = newLine;
    let inserted = 0;
    const deleted: number[] = [];
    const flush = () => {
      for (const [index, line] of deleted.entries())
        removedLines.push({ oldLine: line, beforeLine: runStart + Math.min(index, inserted) });
      deleted.length = 0;
      inserted = 0;
    };
    for (const line of hunk.lines) {
      if (line.startsWith('\\')) continue;
      if (line.startsWith('-')) {
        if (!deleted.length && !inserted) runStart = newLine;
        deleted.push(oldLine++);
      } else if (line.startsWith('+')) {
        if (!deleted.length && !inserted) runStart = newLine;
        inserted++;
        const last = added.at(-1);
        if (last?.end === newLine - 1) last.end = newLine;
        else added.push({ start: newLine, end: newLine });
        newLine++;
      } else {
        flush();
        oldLine++;
        newLine++;
      }
    }
    flush();
  }
  // Keep offsets and line numbers while excluding YAML from rendered removals.
  const oldMatter = frontmatter(previous);
  const parseable = oldMatter.replace(/[^\r\n]/g, ' ') + previous.slice(oldMatter.length);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(parseable);
  const newMatter = frontmatter(current);
  const currentTree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(newMatter.replace(/[^\r\n]/g, ' ') + current.slice(newMatter.length));
  const paragraphs: import('../index').InlinePageChanges['paragraphs'] = [];
  const used = new Set<number>();
  const removed = tree.children.flatMap((node) => {
    const p = node.position;
    if (!p) return [];
    const affected = removedLines.filter(
      (line) => line.oldLine >= p.start.line && line.oldLine <= p.end.line,
    );
    if (!affected.length) return [];
    const removal: import('../index').InlinePageChanges['removed'][number] = {
      beforeLine: affected[0].beforeLine,
      markdown: previous.slice(p.start.offset, p.end.offset),
    };
    const oldText = paragraphText(node);
    const candidate = currentTree.children.find(
      (entry) =>
        entry.position &&
        entry.position.start.line <= removal.beforeLine &&
        entry.position.end.line >= removal.beforeLine &&
        added.some(
          (range) =>
            range.start <= entry.position!.end.line && range.end >= entry.position!.start.line,
        ),
    );
    const newText = candidate && paragraphText(candidate);
    const start = candidate?.position?.start.line;
    if (oldText !== undefined && newText !== undefined && start !== undefined && !used.has(start)) {
      const linkSegments =
        oldText === newText && candidate ? linkTargetSegments(node, candidate) : undefined;
      if (linkSegments) {
        used.add(start);
        removal.inlineStart = start;
        paragraphs.push({ start, text: newText, segments: linkSegments });
        return [removal];
      }
      if (oldText === newText) return [removal];
      const segments = diffArrays(words(oldText), words(newText), {
        maxEditLength: 2000,
        timeout: 200,
      })?.map((part) => ({ ...part, value: part.value.join('') }));
      const commonLength =
        segments?.reduce(
          (length, part) =>
            length + (part.added || part.removed ? 0 : significantLength(part.value)),
          0,
        ) ?? 0;
      // A rewrite can share incidental characters without being the same paragraph.
      // Only splice replacements with substantial context; pure insertions/deletions
      // still retain their unchanged prefix even when the edit is much longer.
      // Compare coverage against the shorter side so a long expansion does not
      // discard a substantial shared prefix from the original paragraph.
      const replacement =
        segments?.some((part) => part.added) && segments.some((part) => part.removed);
      const comparable =
        !replacement ||
        commonLength >= Math.min(significantLength(oldText), significantLength(newText)) / 2;
      if (segments && commonLength > 0 && comparable) {
        used.add(start);
        removal.inlineStart = start;
        paragraphs.push({ start, text: newText, segments: inlineSegments(segments) });
      }
    }
    return [removal];
  });
  return {
    changed: true,
    changes: {
      sourcePath,
      sourceHash: sourceHash(current),
      additions: diff.additions,
      deletions: diff.deletions,
      added,
      removed,
      paragraphs,
      metadataChanged: oldMatter !== frontmatter(current),
    },
  };
}
