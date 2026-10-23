import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compile } from '@mdx-js/mdx';
import { compileMdx } from '@fumadocs/satteri/compile';
import { applySatteriPreset } from '@fumadocs/satteri/preset';
import { gitChangelog } from '../src/satteri';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createWorkspaceWrapper } from '../src/plugins/workspace';
import { buildInlineChanges } from '../src/workspace/inline';

const cwd = mkdtempSync(path.join(tmpdir(), 'history-list-'));
execFileSync('git', ['init'], { cwd, stdio: 'pipe' });
execFileSync(
  'git',
  [
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.test',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-m',
    'Fixture',
  ],
  { cwd, stdio: 'pipe' },
);
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

describe.each(['remark', 'satteri'] as const)('%s list changes', (compiler) => {
  async function render(previous: string, current: string) {
    const file = path.join(cwd, 'page.mdx');
    writeFileSync(file, current);
    const result = buildInlineChanges(previous, current, 'page.mdx');
    const changes = result.changed && 'changes' in result ? result.changes : undefined;
    const runtime = `data:text/javascript,${encodeURIComponent(`
    import { createElement } from '${import.meta.resolve('react')}';
    import { GitPageChangesView } from '${import.meta.resolve('../dist/ui/index.js')}';
    export * from '${import.meta.resolve('../dist/ui/index.js')}';
    export function GitPageChanges(props) {
      return createElement(GitPageChangesView, { ...props, changes: ${JSON.stringify(changes)} });
    }
  `)}`;
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const options = {
        repository: { directory: cwd, url: 'https://github.com/example/docs' },
        workspaceChanges: true,
      };
      const wrapper = createWorkspaceWrapper(options);
      const code = (
        compiler === 'remark'
          ? String(
              await compile(
                { value: current, path: file },
                {
                  remarkPlugins: [
                    remarkGfm,
                    () => async (tree, file) => {
                      tree.children = (await wrapper(file.path, tree))!;
                    },
                  ],
                },
              ),
            )
          : (
              await compileMdx({
                source: current,
                filePath: file,
                format: 'mdx',
                frontmatter: {},
                environment: 'bundler',
                options: await applySatteriPreset({
                  mdastPlugins: (plugins) => [gitChangelog(options), ...plugins],
                  rehypeCodeOptions: false,
                })('bundler'),
              })
            ).code
      )
        .replaceAll('fumadocs-page-history/ui', runtime)
        .replaceAll('react/jsx-runtime', import.meta.resolve('react/jsx-runtime'));
      const { default: Content } = await import(`data:text/javascript,${encodeURIComponent(code)}`);
      return renderToStaticMarkup(<Content />);
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it.each(['\n', '\n\n'])('changes only the edited list item (separator %j)', async (separator) => {
    const previous = [
      '- Shared first item.',
      '- Core defines **Observer**.',
      '- Shared last item.',
    ].join(separator);
    const current = previous.replace('**Observer**', '**Citation**');
    const html = await render(previous, current);
    expect(html.match(/Shared first item/g)).toHaveLength(1);
    expect(html.match(/Shared last item/g)).toHaveLength(1);
    expect(html.match(/<ul/g)).toHaveLength(1);
    expect(html).toContain('data-change="removed"');
    expect(html).toContain('data-change="added"');
    expect(html).not.toContain('fgc-inline-removed');
  });

  it.each([
    ['- Alpha\n- Remove me\n- Omega\n', '- Alpha\n- Omega\n'],
    ['- Alpha\n- Remove me\n\nAfter\n', '- Alpha\n\nAfter\n'],
    ['- Remove me\n- Omega\n', '- Omega\n'],
  ])('keeps removed items in their list: %s', async (previous, current) => {
    const html = await render(previous, current);
    expect(html.match(/Remove me/g)).toHaveLength(1);
    expect(html.match(/<ul/g)).toHaveLength(1);
    expect(html).toMatch(/<li[^>]*class="[^"]*fgc-inline-removed/);
    expect(html.indexOf('Remove me')).toBeLessThan(html.indexOf('</ul>'));
    expect(html.match(/Alpha/g)?.length ?? 0).toBe(current.includes('Alpha') ? 1 : 0);
  });

  it('highlights only an inserted item and keeps whole-list deletion outside the next list', async () => {
    const inserted = await render('- Alpha\n- Omega\n', '- Alpha\n- New item\n- Omega\n');
    expect(inserted.match(/data-change="added"/g)).toHaveLength(1);
    expect(inserted).toMatch(/<li[^>]*data-change="added"[^>]*>New item<\/li>/);
    expect(inserted).not.toContain('fgc-inline-removed');
    const deleted = await render(
      '- Removed list\n\nDivider\n\n- Kept list\n',
      'Divider\n\n- Kept list\n',
    );
    expect(deleted.match(/Kept list/g)).toHaveLength(1);
    expect(deleted.indexOf('Removed list')).toBeLessThan(deleted.indexOf('Divider'));
    expect(deleted).toMatch(/<aside[^>]*><ul>/);
  });

  it('preserves links and limits a complex-item fallback to that item', async () => {
    const previous = '- Shared\n- Read [guide](/old).\n- Parent\n  - Nested old\n- Tail\n';
    const current = previous.replace('/old', '/new').replace('Nested old', 'Nested new');
    const html = await render(previous, current);
    expect(html.match(/Shared/g)).toHaveLength(1);
    expect(html.match(/Tail/g)).toHaveLength(1);
    expect(html.match(/Read /g)).toHaveLength(1);
    expect(html).toContain('data-change="link"');
    expect(html).toContain('href="/new"');
    expect(html).toContain('Nested old');
    expect(html).toContain('Nested new');
  });

  it('preserves ordered numbering, tasks, and nested content', async () => {
    const old = '3. Alpha\n4. Remove me\n5. Omega\n\n- [ ] Pending\n- Parent\n  - Nested\n';
    const current = '3. Alpha\n4. Omega\n\n- [x] Pending\n- Parent\n  - Nested\n';
    const html = await render(old, current);
    expect(html).toContain('<ol start="3"');
    expect(html).toMatch(/<li[^>]*value="4"[^>]*>Omega/);
    expect(html).toContain('checked=""');
    expect(html.match(/Parent/g)).toHaveLength(1);
    expect(html.match(/Nested/g)).toHaveLength(1);
  });
});
