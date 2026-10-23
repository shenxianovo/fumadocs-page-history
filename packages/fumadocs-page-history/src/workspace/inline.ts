import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { RootContent } from 'mdast';
import { diffArrays } from 'diff';
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
  const unchangedLines = new Map<number, number>();
  let lastOldLine = 1;
  let lastNewLine = 1;
  for (const hunk of diff.hunks) {
    while (lastOldLine < hunk.oldStart) unchangedLines.set(lastOldLine++, lastNewLine++);
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
        unchangedLines.set(oldLine, newLine);
        oldLine++;
        newLine++;
      }
    }
    flush();
    lastOldLine = oldLine;
    lastNewLine = newLine;
  }
  const oldLineCount = previous.split('\n').length;
  while (lastOldLine <= oldLineCount) unchangedLines.set(lastOldLine++, lastNewLine++);
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
  const currentLists = currentTree.children.filter((node) => node.type === 'list');
  type Block = {
    node: RootContent;
    candidates: RootContent[];
    listStart?: number;
    beforeLine?: number;
  };
  const blocks = tree.children.flatMap((node): Block[] => {
    if (node.type === 'list' && node.position) {
      const p = node.position;
      // Surviving lines anchor the list even when its first/last item is deleted.
      const mapped = [...unchangedLines]
        .filter(([line]) => line >= p.start.line && line <= p.end.line)
        .map(([, line]) => line);
      const matched =
        currentLists.find(
          (list) =>
            list.position &&
            mapped.some(
              (line) => line >= list.position!.start.line && line <= list.position!.end.line,
            ),
        ) ??
        currentLists.find(
          (list) =>
            list.position &&
            removedLines.some(
              (line) =>
                line.oldLine >= p.start.line &&
                line.oldLine <= p.end.line &&
                line.beforeLine >= list.position!.start.line &&
                line.beforeLine <= list.position!.end.line &&
                added.some(
                  (range) =>
                    range.start <= list.position!.end.line &&
                    range.end >= list.position!.start.line,
                ),
            ),
        );
      if (matched && node.ordered === matched.ordered) {
        const structure = (item: RootContent) =>
          JSON.stringify(item, (key, value) =>
            key === 'position' || key === 'spread' ? undefined : value,
          );
        const alignment = diffArrays(
          node.children.map(structure),
          matched.children.map(structure),
          {
            maxEditLength: 2000,
            timeout: 200,
          },
        );
        if (alignment) {
          const items: Block[] = [];
          let oldIndex = 0;
          let newIndex = 0;
          let deleted: typeof node.children = [];
          let inserted: typeof node.children = [];
          const flush = () => {
            for (const [i, item] of deleted.entries()) {
              const candidate = inserted[i];
              items.push({
                node: item,
                candidates: candidate ? [candidate] : [],
                listStart: matched.position!.start.line,
                beforeLine:
                  candidate?.position?.start.line ??
                  matched.children[newIndex]?.position?.start.line ??
                  matched.position!.end.line + 1,
              });
            }
            deleted = [];
            inserted = [];
          };
          for (const part of alignment) {
            if (part.removed) {
              deleted.push(...node.children.slice(oldIndex, oldIndex + part.count));
              oldIndex += part.count;
            } else if (part.added) {
              inserted.push(...matched.children.slice(newIndex, newIndex + part.count));
              newIndex += part.count;
            } else {
              flush();
              // Unchanged items can have changed source lines (e.g. numbering).
              // Remove those lines from the added ranges too.
              for (const item of matched.children.slice(newIndex, newIndex + part.count)) {
                const p = item.position!;
                const clean = added.flatMap((range) => {
                  if (range.end < p.start.line || range.start > p.end.line) return [range];
                  return [
                    ...(range.start < p.start.line
                      ? [{ start: range.start, end: p.start.line - 1 }]
                      : []),
                    ...(range.end > p.end.line ? [{ start: p.end.line + 1, end: range.end }] : []),
                  ];
                });
                added.splice(0, added.length, ...clean);
              }
              oldIndex += part.count;
              newIndex += part.count;
            }
          }
          flush();
          return items;
        }
      }
    }
    return [{ node, candidates: currentTree.children }];
  });
  const removed = blocks.flatMap(({ node, candidates, listStart, beforeLine }) => {
    const p = node.position;
    if (!p) return [];
    const affected = removedLines.find(
      (line) => line.oldLine >= p.start.line && line.oldLine <= p.end.line,
    );
    if (!affected) return [];
    const removal: InlinePageChanges['removed'][number] = {
      beforeLine: beforeLine ?? affected.beforeLine,
      markdown: previous.slice(p.start.offset, p.end.offset),
      ...(listStart !== undefined ? { listStart } : {}),
    };
    const candidate = candidates.find(
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
