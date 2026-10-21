import { structuredPatch } from 'diff';
import type { PageDiff } from '../index';

/** Server only. Preserve whitespace and EOF changes, and bound pathological comparisons. */
export function createPageDiff(
  previous: string,
  current: string,
  paths: Pick<PageDiff, 'sourcePath' | 'previousPath'>,
): PageDiff {
  if (previous.includes('\0') || current.includes('\0')) return { ...paths, unavailable: 'binary' };
  const patch = structuredPatch(paths.previousPath, paths.sourcePath, previous, current, '', '', {
    context: 3,
    maxEditLength: 10_000,
  });
  if (!patch) return { ...paths, unavailable: 'complexity' };
  let additions = 0;
  let deletions = 0;
  for (const hunk of patch.hunks)
    for (const line of hunk.lines) {
      if (line.startsWith('+')) additions++;
      else if (line.startsWith('-')) deletions++;
    }
  return { ...paths, hunks: patch.hunks, additions, deletions };
}
