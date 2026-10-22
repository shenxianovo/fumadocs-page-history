import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { createPageDiff } from '../git/diff';
import type { InlinePageChanges, PageChangesResult, SourceRange } from '../index';
import { compareParagraphs } from './text';

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
  const markdown = unified().use(remarkParse).use(remarkGfm);
  const tree = markdown.parse(parseable);
  const newMatter = frontmatter(current);
  const currentTree = markdown.parse(
    newMatter.replace(/[^\r\n]/g, ' ') + current.slice(newMatter.length),
  );
  const paragraphs: InlinePageChanges['paragraphs'] = [];
  const used = new Set<number>();
  const removed = tree.children.flatMap((node) => {
    const p = node.position;
    if (!p) return [];
    const affected = removedLines.find(
      (line) => line.oldLine >= p.start.line && line.oldLine <= p.end.line,
    );
    if (!affected) return [];
    const removal: InlinePageChanges['removed'][number] = {
      beforeLine: affected.beforeLine,
      markdown: previous.slice(p.start.offset, p.end.offset),
    };
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
    const start = candidate?.position?.start.line;
    if (candidate && start !== undefined && !used.has(start)) {
      const paragraph = compareParagraphs(node, candidate);
      if (paragraph) {
        used.add(start);
        removal.inlineStart = start;
        paragraphs.push({ start, ...paragraph });
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
      metadataChanged: oldMatter !== newMatter,
    },
  };
}
