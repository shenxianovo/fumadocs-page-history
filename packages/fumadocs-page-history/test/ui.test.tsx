import { renderToStaticMarkup } from 'react-dom/server';
import { TranslationProvider } from '@fuma-translate/react';
import { FrameworkProvider } from 'fumadocs-core/framework';
import { gitChangelogTranslations, zhCN } from '../src/i18n';
import { expect, it, vi } from 'vitest';
import { getContributors, shouldShowContributors, type HistoryCommit } from '../src';
import { GitChangelog, GitContributors } from '../src/ui';
import { CommitMessage } from '../src/ui/message';
import { HistoryDate, isFreshChange, relativeDate } from '../src/ui/shared';

const commit: HistoryCommit = {
  sha: 'a'.repeat(40),
  shortSha: 'aaaaaaa',
  date: '2026-01-01T00:00:00Z',
  authoredAt: '2026-01-01T00:00:00Z',
  committedAt: '2026-01-01T00:00:00Z',
  message: 'Initial commit',
  description: 'Details',
  authors: [{ name: 'Example' }],
  url: 'https://example.com/commit/a',
  tags: [{ name: 'v1.0', url: 'https://example.com/releases/v1.0' }],
};

it('renders tagged history in server HTML when initially expanded', () => {
  const html = renderToStaticMarkup(<GitChangelog commits={[commit]} defaultExpanded />);
  expect(html).toContain('Initial commit');
  expect(html).toContain('v1.0');
  expect(html).toContain('Example');
  expect(html).not.toContain('>Details<');
  expect(html).toContain('aria-expanded="true"');
  expect(html.toLowerCase()).toContain('datetime="2026-01-01t00:00:00z"');
});

it('uses native collapsed rendering while retaining contributors and the latest edit', () => {
  const html = renderToStaticMarkup(<GitChangelog commits={[commit]} />);
  expect(html).toContain('Example');
  expect(html).toContain('Last edited');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('Initial commit');
  expect(html).not.toContain('hidden="until-found"');
});

it('renders UTC before hydration even when the server uses another time zone', () => {
  vi.stubEnv('TZ', 'America/Los_Angeles');
  try {
    const html = renderToStaticMarkup(<GitChangelog commits={[commit]} defaultExpanded />);
    expect(html).toContain('Jan 1, 2026');
    expect(html).not.toContain('Dec 31, 2025');
    expect(html).toMatch(/<time[^>]+title="[^"]+ UTC"/);
  } finally {
    vi.unstubAllEnvs();
  }
});

it('uses one native toggle for the whole header, with sorting outside the toggle', () => {
  const html = renderToStaticMarkup(<GitChangelog commits={[commit]} defaultExpanded />);
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(
    ([button]) => button,
  );
  const toggles = buttons.filter((button) => /class="[^"]*fgc-toggle/.test(button));
  expect(toggles).toHaveLength(1);
  expect(toggles[0]).toContain('Last edited');
  expect(toggles[0]).toContain('Collapse history');
  expect(toggles[0]).toContain('aria-expanded="true"');
  expect(toggles[0]).not.toContain('fgc-sort');
  expect(buttons.some((button) => button.includes('fgc-sort'))).toBe(true);
});

it('offers sorting only while expanded and labels the toggle with its action', () => {
  const html = renderToStaticMarkup(<GitChangelog commits={[commit]} />);
  expect(html).toContain('View full history');
  expect(html).not.toContain('Collapse history');
  expect(html).not.toContain('fgc-sort');
});

it('escapes commit text and rejects unsafe author, avatar, tag, and commit URLs', () => {
  const html = renderToStaticMarkup(
    <GitChangelog
      defaultExpanded
      commits={[
        {
          ...commit,
          message: '<script>alert(1)</script>',
          url: 'javascript:alert(1)',
          authors: [
            { name: '<img src=x>', url: 'data:text/html,bad', avatarUrl: 'javascript:bad' },
          ],
          tags: [{ name: '<b>tag</b>', url: 'javascript:bad' }],
        },
      ]}
    />,
  );
  expect(html).toContain('&lt;img src=x&gt;');
  expect(html).toContain('&lt;b&gt;tag&lt;/b&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('javascript:');
  expect(html).not.toContain('data:text/html');
});

it('sorts input without mutating it and distinguishes empty history', () => {
  const later = {
    ...commit,
    sha: 'b'.repeat(40),
    date: '2026-02-01T00:00:00Z',
    message: 'Later commit',
  };
  const commits = [commit, later];
  const html = renderToStaticMarkup(
    <GitChangelog commits={commits} showContributors={false} defaultExpanded />,
  );
  expect(html.indexOf('Later commit')).toBeLessThan(html.indexOf('Initial commit'));
  expect(commits[0]).toBe(commit);
  expect(html).not.toContain('data-git-contributors');
  expect(html).toContain('aria-expanded="true"');
  expect(renderToStaticMarkup(<GitChangelog commits={[]} />)).toContain('No history yet.');
});

it('renders Markdown and issue references without interpreting code or existing links', () => {
  const html = renderToStaticMarkup(
    <CommitMessage
      repositoryUrl="https://example.com/repo"
      message={'fix **#12** with `#34` and [*#56*](https://example.com/other)'}
    />,
  );
  expect(html).toMatch(
    /<strong><a [^>]*href="https:\/\/example.com\/repo\/issues\/12"[^>]*>#12<\/a><\/strong>/,
  );
  expect(html).toContain('<code>#34</code>');
  expect(html).not.toContain('/issues/34');
  expect(html).not.toContain('/issues/56');
  expect(html).toMatch(/<a [^>]*href="https:\/\/example.com\/other"[^>]*><em>#56<\/em><\/a>/);
});

it('uses the host framework for local links and Fumadocs external-link behavior', () => {
  const html = renderToStaticMarkup(
    <FrameworkProvider
      usePathname={() => '/docs'}
      useParams={() => ({})}
      useRouter={() => ({ push() {}, refresh() {} })}
      Link={(props) => <a {...props} data-framework-link />}
    >
      <CommitMessage message="[Local](/docs/guide) [External](https://example.com)" />
    </FrameworkProvider>,
  );
  expect(html).toMatch(/<a [^>]*href="\/docs\/guide"[^>]*data-framework-link/);
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noreferrer noopener"');
});

it.each([false, true])('preserves safe Markdown URLs with inline=%s', (inline) => {
  const html = renderToStaticMarkup(
    <CommitMessage
      inline={inline}
      message="[Guide](guide.md) [Email](mailto:alex@example.com) ![Diagram](./diagram.png)"
    />,
  );
  expect(html).toContain('href="guide.md"');
  expect(html).toContain('href="mailto:alex@example.com"');
  expect(html).toContain('src="./diagram.png"');
});

it('does not render executable URLs or raw HTML from Markdown', () => {
  const html = renderToStaticMarkup(
    <CommitMessage
      message={
        '[bad](javascript:alert) ![image](data:text/html,bad) <iframe src="https://evil.test"></iframe>'
      }
    />,
  );
  expect(html).not.toContain('javascript:');
  expect(html).not.toContain('data:text/html');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('<img');
});

it('honors display options without hiding tagged commits', () => {
  const html = renderToStaticMarkup(
    <GitChangelog
      defaultExpanded
      commits={[commit]}
      hideChangelogHeader
      showContributors={false}
      hideSortBy
      numCommitHashLetters={10}
    />,
  );
  expect(html).not.toContain('<h2');
  expect(html).not.toContain('Oldest first');
  expect(html).toContain('<code>aaaaaaaaaa</code>');
  expect(html).not.toContain('Example');
  expect(html).toContain('Initial commit');
  expect(html).toContain('v1.0');
  expect(
    renderToStaticMarkup(
      <GitChangelog
        commits={[commit]}
        defaultExpanded
        displayAuthorsInsideCommitLine
        showContributors={false}
      />,
    ),
  ).toContain('Example');
  const empty = renderToStaticMarkup(
    <GitChangelog
      defaultExpanded
      commits={[]}
      showContributors={false}
      hideChangelogHeader
      hideChangelogNoChangesText
    />,
  );
  expect(empty).not.toContain('No history yet.');
  expect(empty).not.toContain('aria-expanded');
});

it('shows readable author names beside inline avatars', () => {
  const html = renderToStaticMarkup(
    <GitChangelog
      commits={[
        {
          ...commit,
          authors: [
            { name: 'Example', avatarUrl: 'https://example.com/avatar.png' },
            { name: 'Partner' },
          ],
        },
      ]}
      defaultExpanded
      showContributors={false}
      displayAuthorsInsideCommitLine
    />,
  );
  expect(html).toContain('Example');
  expect(html).toContain('Partner');
  expect(html).not.toMatch(/class="sr-only">(?:Example|Partner)</);
});

it('counts each contributor once per commit, adds explicit authors, and sorts by count', () => {
  const author = { name: 'Author' };
  const partner = { name: 'Partner' };
  const commits = [
    { ...commit, authors: [partner, author, author] },
    { ...commit, sha: 'b'.repeat(40), authors: [author] },
  ];
  expect(getContributors(commits, [{ name: 'Editor' }, partner])).toEqual([
    { name: 'Author', commitsCount: 2 },
    { name: 'Partner', commitsCount: 1 },
    { name: 'Editor', commitsCount: 0 },
  ]);
});

it('supports independent and localized contributors, including empty history', () => {
  const html = renderToStaticMarkup(
    <GitContributors
      commits={[]}
      authors={[{ name: 'Editor', i18n: { 'zh-CN': '编辑者' } }]}
      locale="zh-CN"
      hideContributorsHeader
    />,
  );
  expect(html).toContain('编辑者');
  expect(html).not.toContain('<h2');
  expect(html).not.toContain('No contributors yet.');
  expect(renderToStaticMarkup(<GitContributors commits={[]} />)).toContain('No contributors yet.');
  expect(shouldShowContributors({ gitChangelog: { disableChangelog: true } })).toBe(true);
  expect(shouldShowContributors({ gitChangelog: false })).toBe(false);
});

it('formats relative dates and highlights only past changes within 24 hours', () => {
  const now = Date.parse('2026-01-02T00:00:00Z');
  expect(relativeDate('2026-01-01T22:00:00Z', now, 'en')).toBe('2 hours ago');
  expect(relativeDate('2026-01-01T22:00:00Z', now, 'zh-CN')).toBe('2小时前');
  expect(isFreshChange('2026-01-01T22:00:00Z', now)).toBe(true);
  expect(isFreshChange('2026-01-01T00:00:00Z', now)).toBe(false);
  expect(isFreshChange('2026-01-03T00:00:00Z', now)).toBe(false);
  expect(isFreshChange('2026-01-01T22:00:00Z', null)).toBe(false);
});

it('uses deterministic absolute dates before hydration even with relative time enabled', () => {
  const html = renderToStaticMarkup(<GitChangelog commits={[commit]} commitsRelativeTime />);
  expect(html).toContain('Jan 1, 2026');
  expect(html).not.toContain('ago');
  expect(html).toContain('data-pending');
});

it('marks only relative dates as pending before hydration', () => {
  const html = renderToStaticMarkup(<GitChangelog commits={[commit]} defaultExpanded />);
  // The summary is always relative; absolute commit rows are final on the server.
  expect(html.match(/data-pending/g)).toHaveLength(1);
});

it('keeps relative row dates to the last week and absolute dates beyond it', () => {
  const date = (now: string, recentOnly: boolean) =>
    renderToStaticMarkup(
      <HistoryDate
        value="2026-01-01T00:00:00Z"
        locale="en"
        timeZone="UTC"
        relative
        recentOnly={recentOnly}
        now={Date.parse(now)}
      />,
    );
  expect(date('2026-01-03T00:00:00Z', true)).toContain('2 days ago');
  expect(date('2026-01-20T00:00:00Z', true)).toContain('Jan 1, 2026');
  expect(date('2026-01-20T00:00:00Z', false)).toContain('weeks ago');
  expect(date('2026-01-20T00:00:00Z', false)).not.toContain('data-pending');
});

it('renders inline commit Markdown without block elements inside a timeline row', () => {
  const html = renderToStaticMarkup(
    <CommitMessage
      message={'**Subject** with `code` and #12'}
      repositoryUrl="https://example.com/repo"
      inline
    />,
  );
  expect(html).not.toMatch(/<(?:div|p|pre|h[1-6])(?:\s|>)/);
  expect(html).toContain('<strong>Subject</strong>');
  expect(html).toContain('https://example.com/repo/issues/12');
});

it('renders generated translation keys through the native provider', () => {
  const translations = zhCN().value;
  expect(gitChangelogTranslations().keys.every((key) => key in translations)).toBe(true);
  const html = renderToStaticMarkup(
    <TranslationProvider translations={translations}>
      <GitChangelog commits={[commit]} defaultExpanded locale="zh-CN" />
    </TranslationProvider>,
  );
  expect(html).toContain('贡献者');
  expect(html).toContain('页面历史');
  expect(html).toContain('最后编辑于');
  expect(html).toContain('收起历史');
  expect(html).not.toContain('Page history');
});

it('uses the same explicit anchors as the compiled table of contents', () => {
  const html = renderToStaticMarkup(
    <GitChangelog commits={[commit]} id="changes" contributorsId="people" />,
  );
  expect(html).toMatch(/<h2[^>]*id="people"/);
  expect(html).toMatch(/<h2[^>]*id="changes"/);
});

it('uses readable, stable default anchors independent of the React tree', () => {
  for (const element of [
    <GitChangelog key="standalone" commits={[commit]} />,
    <main key="nested">
      <div>Another sibling</div>
      <GitChangelog commits={[commit]} />
    </main>,
  ]) {
    const html = renderToStaticMarkup(element);
    expect(html).toMatch(/<h2[^>]*id="git-contributors"/);
    expect(html).toMatch(/<h2[^>]*id="git-history"/);
    expect(html).not.toMatch(/id="git-(?:contributors|history)-_R_/);
  }
  expect(renderToStaticMarkup(<GitContributors commits={[commit]} />)).toMatch(
    /<h2[^>]*id="git-contributors"/,
  );
});

it('keeps manually rendered instances distinct when given custom anchors', () => {
  const html = renderToStaticMarkup(
    <>
      <GitChangelog commits={[commit]} id="first-history" />
      <GitChangelog commits={[commit]} id="second-history" />
    </>,
  );
  const headings = [...html.matchAll(/<h2[^>]*id="([^"]+)"/g)].map((match) => match[1]);
  expect(headings).toEqual([
    'first-history-contributors',
    'first-history',
    'second-history-contributors',
    'second-history',
  ]);
});
