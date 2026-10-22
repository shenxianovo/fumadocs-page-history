export interface Repository {
  /** Public HTTP(S) repository URL, without credentials, query, or fragment. */
  url: string;
  /** Optional directory inside the local checkout; normally discovered automatically. */
  directory?: string;
}

/** Public metadata only. Git identities and author mappings stay in the Git reader. */
export interface HistoryAuthor {
  name: string;
  avatarUrl?: string;
  url?: string;
  i18n?: Record<string, string>;
}

export interface HistoryCommit {
  sha: string;
  shortSha: string;
  date: string;
  authoredAt: string;
  committedAt: string;
  message: string;
  description: string;
  authors: HistoryAuthor[];
  url: string;
  repositoryUrl?: string;
  tags?: { name: string; url: string }[];
}

export interface PageDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Unified patch lines, including their leading space, +, -, or \\. */
  lines: string[];
}

export type PageDiff = {
  sourcePath: string;
  previousPath: string;
} & (
  | { hunks: PageDiffHunk[]; additions: number; deletions: number; unavailable?: never }
  | { unavailable: 'too-large' | 'binary' | 'complexity'; hunks?: never }
);

export interface SourceRange {
  start: number;
  end: number;
  /** Plain text for paragraphs whose original inline formatting can be retained. */
  text?: string;
}

export interface InlinePageChanges {
  sourcePath: string;
  /** Digest of the working source; prevents marking a stale rendered document. */
  sourceHash: string;
  additions: number;
  deletions: number;
  added: SourceRange[];
  removed: { beforeLine: number; markdown: string; inlineStart?: number }[];
  paragraphs: {
    start: number;
    text: string;
    /** Keep full revisions for rewrites; interleave smaller edits in one paragraph. */
    layout: 'inline' | 'separate';
    segments: {
      text: string;
      kind: 'same' | 'added' | 'removed';
      linkTarget?: { previous: string; current: string };
    }[];
  }[];
  metadataChanged: boolean;
}

export type PageChangesResult =
  | { changed: false }
  | { changed: true; changes: InlinePageChanges }
  | { changed: true; unavailable: 'too-large' | 'binary' | 'complexity' | 'conflict' };

export interface ChangelogFrontmatter {
  authors?: string[];
  gitChangelog?:
    | boolean
    | {
        disableChangelog?: boolean;
        disableContributors?: boolean;
      };
}

/** Per-page controls; history and attribution can be enabled independently. */
export function shouldShowChangelog(frontmatter: ChangelogFrontmatter = {}): boolean {
  const options = frontmatter.gitChangelog;
  return options !== false && !(typeof options === 'object' && options.disableChangelog);
}

export function shouldShowContributors(frontmatter: ChangelogFrontmatter = {}): boolean {
  const options = frontmatter.gitChangelog;
  return options !== false && !(typeof options === 'object' && options.disableContributors);
}

export interface HistoryContributor extends HistoryAuthor {
  commitsCount: number;
}

/** Count each author once per revision; explicit contributors need not have a commit. */
export function getContributors(
  commits: readonly HistoryCommit[],
  additional: readonly HistoryAuthor[] = [],
): HistoryContributor[] {
  const contributors = new Map<string, HistoryContributor>();
  const key = (author: HistoryAuthor) => author.url ?? author.name;
  for (const commit of commits) {
    for (const [id, author] of new Map(commit.authors.map((author) => [key(author), author]))) {
      const previous = contributors.get(id);
      contributors.set(id, {
        ...previous,
        ...author,
        commitsCount: (previous?.commitsCount ?? 0) + 1,
      });
    }
  }
  for (const author of additional) {
    const previous = contributors.get(key(author));
    contributors.set(key(author), {
      ...previous,
      ...author,
      commitsCount: previous?.commitsCount ?? 0,
    });
  }
  return [...contributors.values()].sort(
    (a, b) => b.commitsCount - a.commitsCount || a.name.localeCompare(b.name),
  );
}
