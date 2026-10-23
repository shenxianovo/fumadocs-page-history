'use client';

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { useTranslations } from '@fuma-translate/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { InlinePageChanges, PageChangesResult, SourceRange } from '../index';
import { highlightRemovedWords } from './removed-words';

interface RemovedContent {
  markdown: string;
  segments?: InlinePageChanges['paragraphs'][number]['segments'];
}

type ParagraphChange = InlinePageChanges['paragraphs'][number];

interface ChangesContext {
  changes?: InlinePageChanges;
  ranges: readonly SourceRange[];
  paragraphs: ReadonlyMap<number, ParagraphChange>;
  removedBefore: Map<number, RemovedContent[]>;
  listTails: Map<number, RemovedContent[]>;
}
const Context = createContext<ChangesContext>({
  ranges: [],
  paragraphs: new Map(),
  removedBefore: new Map(),
  listTails: new Map(),
});

export interface GitPageChangesProps {
  sourcePath: string;
  sourceHash: string;
  ranges: readonly SourceRange[];
  endpoint?: string;
  children: ReactNode;
}

/** A normal rendered document, decorated with fresh local changes in place. */
export function GitPageChanges({
  sourcePath,
  sourceHash,
  ranges,
  endpoint = '/api/page-changes',
  children,
}: GitPageChangesProps) {
  const t = useTranslations({ note: 'git changelog' });
  const [result, setResult] = useState<PageChangesResult>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function update() {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const url = new URL(endpoint, window.location.href);
        if (url.origin !== window.location.origin)
          throw new Error('The endpoint must be same-origin.');
        url.searchParams.set('path', sourcePath);
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Comparison unavailable.');
        const data = (await response.json()) as PageChangesResult;
        if (!controller.signal.aborted) {
          setResult(data);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult(undefined);
          setFailed(true);
        }
      } finally {
        pending = false;
      }
    }
    void update();
    const timer = setInterval(() => void update(), 3000);
    const onVisible = () => void update();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [endpoint, sourcePath, sourceHash]);
  const snapshot = result?.changed && 'changes' in result ? result.changes : undefined;
  const changes =
    snapshot?.sourcePath === sourcePath && snapshot.sourceHash === sourceHash
      ? snapshot
      : undefined;
  return (
    <GitPageChangesView changes={changes} ranges={ranges}>
      {(failed || result?.changed) && (
        <div className="fgc-inline-status not-prose" role="status">
          <span>
            {failed
              ? t('Page changes are unavailable. Reconnecting automatically.')
              : result?.changed && 'unavailable' in result
                ? result.unavailable === 'conflict'
                  ? t('Resolve merge conflicts to view page changes.')
                  : t('This page cannot be compared inline.')
                : snapshot && !changes
                  ? t('The page is updating. Changes will appear when it is ready.')
                  : t('Uncommitted changes')}
          </span>
          {changes && (
            <span className="fgc-inline-legend">
              <span>
                +{changes.additions} {t('Added')}
              </span>
              <span>
                −{changes.deletions} {t('Removed')}
              </span>
            </span>
          )}
          {changes?.metadataChanged && <span>{t('Page metadata changed')}</span>}
        </div>
      )}
      {children}
    </GitPageChangesView>
  );
}

/** Pure rendering seam, independent of Git transport and refresh policy. */
export function GitPageChangesView({
  changes,
  ranges,
  children,
}: {
  changes?: InlinePageChanges;
  ranges: readonly SourceRange[];
  children: ReactNode;
}) {
  // Verify once, so blocks, text leaves, and removed revisions all use the same
  // compiled-text match before applying offsets from the comparison.
  const paragraphs = new Map<number, ParagraphChange>();
  for (const range of ranges) {
    if (range.kind === 'list') continue;
    const paragraph = changes?.paragraphs.find(
      (entry) => entry.start === range.start && entry.text === range.text,
    );
    if (paragraph) paragraphs.set(range.start, paragraph);
  }
  const removedBefore = new Map<number, RemovedContent[]>();
  const listTails = new Map<number, RemovedContent[]>();
  for (const removal of changes?.removed ?? []) {
    const paragraph =
      removal.inlineStart === undefined ? undefined : paragraphs.get(removal.inlineStart);
    if (paragraph?.layout === 'inline') continue;
    const index = ranges.findIndex(
      (range) =>
        range.end >= removal.beforeLine &&
        (removal.listStart === undefined
          ? range.kind !== 'listItem'
          : range.kind === 'listItem' && range.listStart === removal.listStart),
    );
    if (index < 0 && removal.listStart !== undefined) {
      listTails.set(removal.listStart, [
        ...(listTails.get(removal.listStart) ?? []),
        { markdown: removal.markdown, segments: paragraph?.segments },
      ]);
      continue;
    }
    const target = index < 0 ? ranges.length : index;
    removedBefore.set(target, [
      ...(removedBefore.get(target) ?? []),
      { markdown: removal.markdown, segments: paragraph?.segments },
    ]);
  }
  return (
    <Context.Provider value={{ changes, ranges, paragraphs, removedBefore, listTails }}>
      <div className="fgc-inline-page">
        {children}
        <RemovedBlocks blocks={removedBefore.get(ranges.length)} />
      </div>
    </Context.Provider>
  );
}

// The Markdown renderer still handles nested lists and task checkboxes. Only
// unwrap the outer single-item list, since our host element supplies that li.
interface MarkdownNode {
  type: string;
  tagName?: string;
  children?: MarkdownNode[];
}

function unwrapListItem() {
  return (tree: MarkdownNode) => {
    const list = tree.children?.find(
      (node) => node.type === 'element' && ['ul', 'ol'].includes(node.tagName ?? ''),
    );
    const item = list?.children?.find((node) => node.type === 'element' && node.tagName === 'li');
    if (item) tree.children = item.children;
  };
}

function RemovedBlocks({
  blocks,
  listItem = false,
}: {
  blocks?: readonly RemovedContent[];
  listItem?: boolean;
}) {
  const t = useTranslations({ note: 'git changelog' });
  const Tag = listItem ? 'li' : 'aside';
  return blocks?.map(({ markdown, segments }, index) => (
    <Tag
      key={index}
      className={`fgc-inline-removed${listItem ? ' fgc-inline-list-item' : ''}`}
      aria-label={t('Removed content')}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          ...(listItem ? [unwrapListItem] : []),
          ...(segments ? [highlightRemovedWords(segments)] : []),
        ]}
        components={{ img: ({ alt }) => <span>{alt ?? ''}</span> }}
      >
        {markdown}
      </Markdown>
    </Tag>
  ));
}

export function GitChangeList({
  index,
  ordered,
  start,
  className,
  children,
}: {
  index: number;
  ordered?: boolean;
  start?: number;
  className?: string;
  children: ReactNode;
}) {
  const { ranges, removedBefore, listTails } = useContext(Context);
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <>
      <RemovedBlocks blocks={removedBefore.get(index)} />
      <Tag start={ordered ? start : undefined} className={className || undefined}>
        {children}
        <RemovedBlocks blocks={listTails.get(ranges[index]?.start)} listItem />
      </Tag>
    </>
  );
}

export function GitChangeBlock({
  index,
  table = false,
  listItem = false,
  value,
  className,
  children,
}: {
  index: number;
  table?: boolean;
  listItem?: boolean;
  value?: number;
  className?: string;
  children: ReactNode;
}) {
  const { changes, ranges, paragraphs, removedBefore } = useContext(Context);
  const t = useTranslations({ note: 'git changelog' });
  const range = ranges[index];
  const ref = useRef<HTMLElement>(null);
  const paragraph = range && paragraphs.get(range.start);
  useEffect(() => {
    if (!table) return;
    for (const row of ref.current?.querySelectorAll<HTMLElement>('[data-git-row-start]') ?? []) {
      const start = Number(row.dataset.gitRowStart);
      const end = Number(row.dataset.gitRowEnd);
      if (changes?.added.some((line) => line.start <= end && line.end >= start))
        row.setAttribute('data-change', 'added');
      else row.removeAttribute('data-change');
    }
  }, [table, changes, children]);
  const added =
    range && changes?.added.some((line) => line.start <= range.end && line.end >= range.start);
  const Tag = listItem ? 'li' : 'div';
  return (
    <>
      <RemovedBlocks blocks={removedBefore.get(index)} listItem={listItem} />
      <Tag
        className={[listItem ? 'fgc-inline-list-item' : 'fgc-inline-block', className]
          .filter(Boolean)
          .join(' ')}
        ref={(element: HTMLElement | null) => {
          ref.current = element;
        }}
        value={listItem ? value : undefined}
        data-change={added && paragraph?.layout !== 'inline' && !table ? 'added' : undefined}
        aria-label={added ? t('Added content') : undefined}
      >
        {children}
      </Tag>
    </>
  );
}

/** Keep existing links/emphasis in place; only changed text gets a background. */
export function GitChangeText({
  index,
  start,
  value,
  code = false,
}: {
  index: number;
  start: number;
  value: string;
  code?: boolean;
}) {
  const t = useTranslations({ note: 'git changelog' });
  const { ranges, paragraphs } = useContext(Context);
  const range = ranges[index];
  const paragraph = range && paragraphs.get(range.start);
  if (!paragraph) return code ? <code>{value}</code> : value;
  const end = start + value.length;
  let offset = 0;
  const content: ReactNode[] = [];
  for (const [i, segment] of paragraph.segments.entries()) {
    if (segment.kind === 'removed') {
      if (paragraph.layout === 'separate') continue;
      if (offset >= start && (offset < end || (offset === end && end === paragraph.text.length)))
        content.push(
          <span key={i} className="fgc-inline-text" data-change="removed">
            {segment.text}
          </span>,
        );
      continue;
    }
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + segment.text.length);
    if (to > from) {
      const text = segment.text.slice(from - offset, to - offset);
      content.push(
        segment.linkTarget ? (
          <span
            key={i}
            className="fgc-inline-text"
            data-change="link"
            title={`${t('Link target changed')}\n${segment.linkTarget.previous}\n→ ${segment.linkTarget.current}`}
          >
            {text}
          </span>
        ) : segment.kind === 'same' ? (
          text
        ) : (
          <span key={i} className="fgc-inline-text" data-change="added">
            {text}
          </span>
        ),
      );
    }
    offset += segment.text.length;
  }
  return code ? <code>{content}</code> : <>{content}</>;
}
