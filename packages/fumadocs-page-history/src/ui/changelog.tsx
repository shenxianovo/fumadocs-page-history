'use client';

import { useState } from 'react';
import { useTranslations } from '@fuma-translate/react';
import { Heading } from 'fumadocs-ui/components/heading';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'fumadocs-ui/components/ui/collapsible';
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ChevronDown,
  GitCommitHorizontal,
  History,
  Ellipsis,
  Tag,
} from 'lucide-react';
import type { HistoryAuthor, HistoryCommit, Repository } from '../index';
import { GitContributors } from './contributors';
import { GitChangelogLabel } from './label';
import { CommitMessage } from './message';
import {
  Author,
  HistoryDate,
  HistoryLink,
  isFreshChange,
  useNow,
  useBrowserTimeZone,
} from './shared';

export interface GitChangelogProps {
  commits: readonly HistoryCommit[];
  authors?: readonly HistoryAuthor[];
  locale?: string;
  defaultExpanded?: boolean;
  showContributors?: boolean;
  hideChangelogHeader?: boolean;
  hideChangelogNoChangesText?: boolean;
  hideContributorsHeader?: boolean;
  hideSortBy?: boolean;
  displayAuthorsInsideCommitLine?: boolean;
  commitsRelativeTime?: boolean;
  numCommitHashLetters?: number;
  /** Needed for issue links in manually supplied commits without repositoryUrl. */
  repository?: Pick<Repository, 'url'>;
  id?: string;
  contributorsId?: string;
  className?: string;
}

export function GitChangelog({
  commits,
  authors = [],
  locale = 'en',
  defaultExpanded = false,
  showContributors = true,
  hideChangelogHeader = false,
  hideChangelogNoChangesText = false,
  hideContributorsHeader = false,
  hideSortBy = false,
  displayAuthorsInsideCommitLine = false,
  commitsRelativeTime = false,
  numCommitHashLetters = 7,
  repository,
  id,
  contributorsId,
  className = '',
}: GitChangelogProps) {
  const headingId = id ?? 'git-history';
  const t = useTranslations({ note: 'git changelog' });
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [oldestFirst, setOldestFirst] = useState(false);
  const now = useNow();
  const timeZone = useBrowserTimeZone();
  const newest = [...commits].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || a.sha.localeCompare(b.sha),
  );
  const ordered = oldestFirst ? [...newest].reverse() : newest;
  const latest = newest[0];
  const hashLength =
    Number.isSafeInteger(numCommitHashLetters) && numCommitHashLetters > 0
      ? numCommitHashLetters
      : 7;
  // The summary is always relative; list rows switch to absolute dates after a week.
  const date = (value: string, summary = false) => (
    <HistoryDate
      value={value}
      locale={locale}
      timeZone={timeZone}
      relative={summary || commitsRelativeTime}
      recentOnly={!summary}
      now={now}
    />
  );
  const sortLabel = oldestFirst ? t('Newest first') : t('Oldest first');
  return (
    <div className={`fgc ${className}`}>
      {showContributors && (
        <GitContributors
          id={contributorsId ?? (id ? `${id}-contributors` : 'git-contributors')}
          commits={newest}
          authors={authors}
          locale={locale}
          hideContributorsHeader={hideContributorsHeader}
        />
      )}
      <section
        className="fgc-section"
        aria-labelledby={hideChangelogHeader ? undefined : headingId}
        aria-label={hideChangelogHeader ? t('Page history') : undefined}
        data-git-changelog
        data-history-count={commits.length}
      >
        {!hideChangelogHeader && (
          <Heading as="h2" id={headingId} className="fgc-heading">
            <GitChangelogLabel section="history" />
          </Heading>
        )}
        {!latest ? (
          !hideChangelogNoChangesText && <p className="fgc-empty">{t('No history yet.')}</p>
        ) : (
          <Collapsible
            open={expanded}
            onOpenChange={setExpanded}
            className="fgc-panel not-prose"
            data-fresh={isFreshChange(latest.date, now) || undefined}
          >
            <div className="fgc-header">
              <CollapsibleTrigger className="fgc-toggle">
                <span className="fgc-summary">
                  <History className="fgc-history-icon" aria-hidden="true" />
                  <span>
                    {t('Last edited')} {date(latest.date, true)}
                  </span>
                </span>
                <span className="fgc-expand">
                  <span className="fgc-expand-label">
                    {expanded ? t('Collapse history') : t('View full history')}
                  </span>
                  <ChevronDown
                    className="fgc-chevron"
                    data-expanded={expanded}
                    aria-hidden="true"
                  />
                </span>
              </CollapsibleTrigger>
              {/* Sorting only affects the expanded list, so it is not offered while collapsed. */}
              {!hideSortBy && expanded && (
                <button
                  type="button"
                  aria-label={sortLabel}
                  title={sortLabel}
                  className={`${buttonVariants({ variant: 'ghost', size: 'icon-sm' })} fgc-sort`}
                  onClick={() => setOldestFirst(!oldestFirst)}
                >
                  {oldestFirst ? (
                    <ArrowUpWideNarrow aria-hidden="true" />
                  ) : (
                    <ArrowDownWideNarrow aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
            <CollapsibleContent>
              <ol className="fgc-list">
                {ordered.map((commit) => (
                  <li key={commit.sha} data-commit={commit.sha} className="fgc-entry">
                    <GitCommitHorizontal className="fgc-commit-icon" aria-hidden="true" />
                    <div className="fgc-entry-body">
                      <CommitRow
                        commit={commit}
                        hashLength={hashLength}
                        repositoryUrl={repository?.url}
                        locale={locale}
                        displayAuthors={displayAuthorsInsideCommitLine}
                        date={date(commit.date)}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        )}
      </section>
    </div>
  );
}

function CommitRow({
  commit,
  hashLength,
  repositoryUrl,
  locale,
  displayAuthors,
  date,
}: {
  commit: HistoryCommit;
  hashLength: number;
  repositoryUrl?: string;
  locale: string;
  displayAuthors: boolean;
  date: React.ReactNode;
}) {
  const t = useTranslations({ note: 'git changelog' });
  const content = (
    <div className="fgc-row">
      <HistoryLink href={commit.url} className="fgc-sha">
        <code>{commit.sha.slice(0, hashLength)}</code>
      </HistoryLink>
      <span className="fgc-dash" aria-hidden="true">
        {' '}
        -{' '}
      </span>
      <span className="fgc-row-text">
        <CommitMessage
          message={commit.message}
          repositoryUrl={commit.repositoryUrl ?? repositoryUrl}
          inline
        />
        {commit.tags?.map((tag) => (
          <HistoryLink key={tag.name} href={tag.url} className="fgc-tag">
            <Tag aria-hidden="true" />
            {tag.name}
          </HistoryLink>
        ))}
        {displayAuthors && (
          <span className="fgc-inline-authors">
            {commit.authors.map((author) => (
              <Author key={author.url ?? author.name} author={author} locale={locale} compact />
            ))}
          </span>
        )}{' '}
        <span className="fgc-date">· {date}</span>
        {commit.description && (
          <CollapsibleTrigger
            className={`${buttonVariants({ variant: 'ghost', size: 'icon-xs' })} fgc-details-trigger`}
            aria-label={t('Commit details')}
            title={t('Commit details')}
          >
            <Ellipsis aria-hidden="true" />
          </CollapsibleTrigger>
        )}
      </span>
    </div>
  );
  return commit.description ? (
    <Collapsible>
      {content}
      <CollapsibleContent>
        <div className="fgc-details">
          <CommitMessage
            message={commit.description}
            repositoryUrl={commit.repositoryUrl ?? repositoryUrl}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  ) : (
    content
  );
}
