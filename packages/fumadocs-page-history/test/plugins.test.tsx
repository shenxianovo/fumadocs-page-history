import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { compile } from '@mdx-js/mdx';
import { rehypeToc } from 'fumadocs-core/mdx-plugins/rehype-toc';
import { remarkHeading } from 'fumadocs-core/mdx-plugins/remark-heading';
import { compileMdx } from '@fumadocs/satteri/compile';
import { applySatteriPreset } from '@fumadocs/satteri/preset';
import { renderToStaticMarkup } from 'react-dom/server';
import { remarkGitChangelog, type GitChangelogOptions } from '../src/remark';
import { gitChangelog } from '../src/satteri';
import type { ChangelogFrontmatter } from '../src';

const cwd = mkdtempSync(path.join(tmpdir(), 'fumadocs-auto-history-'));
const message = 'Document "quotes", {braces}, </script> and `backticks`';
const options: GitChangelogOptions = {
  repository: { directory: cwd, url: 'https://github.com/example/docs' },
  authorMappings: [
    { displayName: 'Public name', githubUsername: 'public-user', gitEmail: 'private@example.test' },
  ],
};
const source = '# Article\n\nOriginal content.\n\n```md\nUnclosed code fence';

beforeAll(() => {
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Private name',
        GIT_AUTHOR_EMAIL: 'private@example.test',
        GIT_COMMITTER_NAME: 'Private name',
        GIT_COMMITTER_EMAIL: 'private@example.test',
      },
    });
  git('init');
  mkdirSync(path.join(cwd, 'apps/docs'), { recursive: true });
  writeFileSync(path.join(cwd, 'apps/docs/legacy-guide.md'), '# Old Vue guide');
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Legacy page history');
  git('rm', 'apps/docs/legacy-guide.md');
  mkdirSync(path.join(cwd, 'apps/docs'), { recursive: true });
  for (const extension of ['md', 'mdx'])
    writeFileSync(path.join(cwd, `apps/docs/page.${extension}`), source);
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '-m', message);
});
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

// Render the compiled document with a tiny footer probe to inspect the exact props
// crossing the compile/runtime boundary; the actual UI has separate rendering tests.
const probe = `data:text/javascript,${encodeURIComponent(`
export function GitChangelog(props) { return 'HISTORY:' + JSON.stringify(props); }
export function GitContributors(props) { return 'CONTRIBUTORS:' + JSON.stringify(props); }
export function GitChangelogLabel({ section }) { return section === 'contributors' ? 'Contributors' : 'Page history'; }
export function GitPageChanges({ children }) { return children; }
export function GitChangeBlock({ children }) { return children; }
export function GitChangeList({ children }) { return children; }
export function GitChangeText({ value }) { return value; }
`)}`;

// Recreate compiled children across a server/client boundary: development-only
// validation flags are not serialized, but explicit keys are preserved.
const workspaceProbe = `data:text/javascript,${encodeURIComponent(`
import { createElement } from '${import.meta.resolve('react')}';
import { GitPageChangesView } from '${import.meta.resolve('../dist/ui/index.js')}';
export { GitChangelog, GitContributors, GitChangelogLabel, GitChangeBlock, GitChangeText, GitChangeList } from ${JSON.stringify(probe)};
export function GitPageChanges({ children }) {
  const blocks = Array.isArray(children) ? children : [children];
  const restored = blocks.map(child => child && typeof child === 'object'
    ? createElement(child.type, { ...child.props, ...(child.key === null ? {} : { key: child.key }) }) : child);
  return createElement('section', { 'data-missing-keys': blocks.filter(child => child && typeof child === 'object' && child.key === null).length },
    createElement(GitPageChangesView, { ranges: [] }, restored));
}
`)}`;

describe.each(['remark', 'satteri'] as const)('%s automatic footer', (compiler) => {
  async function build({
    extension = 'mdx',
    frontmatter = {},
    settings = options,
    content = source,
    file = `page.${extension}`,
    workspaceRuntime = false,
  }: {
    extension?: 'md' | 'mdx';
    frontmatter?: ChangelogFrontmatter;
    settings?: GitChangelogOptions;
    content?: string;
    file?: string;
    workspaceRuntime?: boolean;
  } = {}) {
    const filePath = path.join(cwd, 'apps/docs', file);
    const code =
      compiler === 'remark'
        ? String(
            await compile(
              { value: content, path: filePath, data: { frontmatter } },
              {
                format: extension,
                outputFormat: 'program',
                remarkPlugins: [remarkHeading, [remarkGitChangelog, settings]],
                rehypePlugins: [rehypeToc],
              },
            ),
          )
        : (
            await compileMdx({
              source: content,
              filePath,
              format: extension,
              frontmatter: { ...frontmatter },
              environment: 'bundler',
              options: await applySatteriPreset({
                mdastPlugins: (plugins) => [gitChangelog(settings), ...plugins],
                rehypeCodeOptions: false,
              })('bundler'),
            })
          ).code;
    const executable = code
      .replaceAll('fumadocs-page-history/ui', workspaceRuntime ? workspaceProbe : probe)
      .replaceAll('react/jsx-runtime', import.meta.resolve('react/jsx-runtime'));
    const { default: Content, toc } = await import(
      `data:text/javascript,${encodeURIComponent(executable)}`
    );
    return {
      code,
      html: renderToStaticMarkup(<Content />),
      toc: toc as { title: React.ReactNode; url: string; depth: number }[],
    };
  }

  it('preserves document child keys across the server/client boundary', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { html } = await build({
        settings: { ...options, workspaceChanges: true },
        workspaceRuntime: true,
      });
      expect(error.mock.calls.flat().join(' ')).not.toContain('unique "key" prop');
      expect(html).toContain('data-missing-keys="0"');
      expect(html).toContain('Original content.');
    } finally {
      error.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('keeps tokens and identity emails out of compiled pages while resolving GitHub authors', async () => {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const fetcher = vi.fn(async () =>
      Response.json({
        sha,
        commit: { author: { email: 'private@example.test' } },
        author: { login: 'public-user' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    try {
      const { code, html } = await build({
        settings: {
          ...options,
          authorMappings: [],
          github: { token: 'secret-token', cacheDir: false },
        },
      });
      expect(html).toContain('https://github.com/public-user.png');
      expect(code).not.toContain('secret-token');
      expect(code).not.toContain('private@example.test');
      expect(code).not.toContain('api.github.com');
      expect(fetcher).toHaveBeenCalledTimes(1);
      fetcher.mockResolvedValue(new Response(null, { status: 429 }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        expect(
          (
            await build({
              settings: {
                ...options,
                authorMappings: [],
                github: { token: 'secret-token', cacheDir: false },
              },
            })
          ).html,
        ).toContain('Private name');
      } finally {
        warn.mockRestore();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('merges explicit migration history while keeping the callback and paths in the build', async () => {
    const getHistoryPaths = vi.fn(() => ['apps/docs/legacy-guide.md']);
    const { code, html } = await build({ settings: { ...options, getHistoryPaths } });
    expect(getHistoryPaths).toHaveBeenCalledExactlyOnceWith('apps/docs/page.mdx');
    expect(html).toContain('Legacy page history');
    expect(code).not.toContain('getHistoryPaths');
    expect(code).not.toContain('legacy-guide.md');
    expect(code).not.toContain(cwd);
    expect((await build()).html).not.toContain('Legacy page history');
  });

  it.each(['md', 'mdx'] as const)(
    'wraps development %s without losing native headings, history or JSX',
    async (extension) => {
      vi.stubEnv('NODE_ENV', 'development');
      try {
        const { code, html, toc } = await build({
          extension,
          settings: { ...options, workspaceChanges: true },
        });
        expect(code).toContain('GitPageChanges');
        expect(code).toContain('GitChangeBlock');
        expect(code).toContain('/api/page-changes');
        expect(code).toContain(`apps/docs/page.${extension}`);
        expect(code).not.toContain(cwd);
        expect(html).toContain('Original content.');
        expect(html).toContain('HISTORY:');
        expect(toc.map((item) => item.url)).toContain('#article');
        expect(html.indexOf('HISTORY:')).toBeGreaterThan(html.indexOf('</pre>'));
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it('never adds a workspace endpoint or source metadata to production or default pages', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(
        (await build({ settings: { ...options, workspaceChanges: true } })).code,
      ).not.toContain('GitPageChanges');
      expect((await build()).code).not.toContain('sourceHash');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(['md', 'mdx'] as const)(
    'injects into %s after the article, even with an unclosed fence',
    async (extension) => {
      const { code, html } = await build({ extension });
      expect(html).toContain('HISTORY:');
      expect(html.indexOf('HISTORY:')).toBeGreaterThan(html.indexOf('</pre>'));
      expect(html).toContain('Public name');
      expect(html).toContain('&lt;/script&gt;');
      expect(html).not.toContain('<script>');
      expect(code).not.toContain('private@example.test');
      expect(code).not.toContain('child_process');
      expect(code).not.toContain('readPageHistory');
    },
  );

  it('skips disabled and filtered pages before accessing Git', async () => {
    const invalidRepo = {
      ...options,
      repository: { ...options.repository, directory: '/this-checkout-does-not-exist' },
    };
    expect(
      (await build({ settings: invalidRepo, frontmatter: { gitChangelog: false } })).code,
    ).not.toContain('fumadocs-page-history/ui');
    expect((await build({ settings: { ...invalidRepo, filter: () => false } })).code).not.toContain(
      'fumadocs-page-history/ui',
    );
  });

  it('supports independent sections, explicit contributors, and shared display options', async () => {
    const { html } = await build({
      frontmatter: { authors: ['Alex'], gitChangelog: { disableContributors: true } },
      settings: { ...options, display: { defaultExpanded: true, locale: 'zh-CN' } },
    });
    expect(html).toContain('&quot;showContributors&quot;:false');
    expect(html).toContain('&quot;defaultExpanded&quot;:true');
    expect(html).toContain('Alex');
    const onlyAuthors = await build({ frontmatter: { gitChangelog: { disableChangelog: true } } });
    expect(onlyAuthors.html).toContain('CONTRIBUTORS:');
    expect(onlyAuthors.html).not.toContain('HISTORY:');
  });

  it('leaves untracked pages without an empty footer', async () => {
    expect((await build({ file: 'new.mdx' })).code).not.toContain('fumadocs-page-history/ui');
  });

  it('adds visible footer sections to the native TOC with matching component anchors', async () => {
    const { html, toc } = await build();
    expect(toc.slice(-2).map((item) => renderToStaticMarkup(<>{item.title}</>))).toEqual([
      'Contributors',
      'Page history',
    ]);
    expect(toc.slice(-2).map((item) => item.url)).toEqual(['#git-contributors', '#git-history']);
    expect(html).toContain('&quot;id&quot;:&quot;git-history&quot;');
    expect(html).toContain('&quot;contributorsId&quot;:&quot;git-contributors&quot;');
    expect(html).not.toContain('[toc]');
  });

  it('omits disabled sections and hidden headings from the TOC', async () => {
    const onlyHistory = await build({
      frontmatter: { gitChangelog: { disableContributors: true } },
    });
    expect(onlyHistory.toc.map((item) => item.url)).toEqual(['#article', '#git-history']);
    const onlyContributors = await build({
      frontmatter: { gitChangelog: { disableChangelog: true } },
    });
    expect(onlyContributors.toc.map((item) => item.url)).toEqual(['#article', '#git-contributors']);
    const hidden = await build({
      settings: {
        ...options,
        display: { hideChangelogHeader: true, hideContributorsHeader: true },
      },
    });
    expect(hidden.toc.map((item) => item.url)).toEqual(['#article']);
    const empty = await build({ file: 'untracked.mdx' });
    expect(empty.toc.map((item) => item.url)).toEqual(['#article']);
  });

  it('keeps footer anchors distinct from authored headings and honors custom IDs', async () => {
    const { toc } = await build({ content: '## Git history\n\n## Git contributors' });
    expect(new Set(toc.map((item) => item.url)).size).toBe(4);
    const custom = await build({
      settings: { ...options, display: { id: 'changes', contributorsId: 'people' } },
    });
    expect(custom.toc.slice(-2).map((item) => item.url)).toEqual(['#people', '#changes']);
  });

  it('does not collide with an author-defined binding', async () => {
    const { html } = await build({
      content: 'export const _FumadocsGitChangelog = "Existing";\n\n{_FumadocsGitChangelog}',
    });
    expect(html).toContain('Existing');
    expect(html).toContain('HISTORY:');
  });
});
