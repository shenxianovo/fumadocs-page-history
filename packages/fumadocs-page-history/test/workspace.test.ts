import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createWorkspaceHandler, readPageChanges } from '../src/workspace';
import { buildInlineChanges } from '../src/workspace/inline';

const temporary: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const p of temporary.splice(0)) rmSync(p, { recursive: true, force: true });
});
function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'page-changes-'));
  temporary.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.test',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.test',
      },
    });
  git('init', '-b', 'main');
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  const commit = () => {
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Snapshot');
  };
  mkdirSync(path.join(root, 'docs'));
  return {
    root,
    git,
    write,
    commit,
    options: { repositoryDirectory: root, contentDirectory: 'docs' },
  };
}

it('decorates complete blocks and preserves unchanged context without line numbers', () => {
  const old =
    '# Title\n\nA paragraph with **old** wording\nand a second line.\n\n```ts\nconst value = 1;\n```\n';
  const current = '# Title\n\nA paragraph with **new** wording\nand a second line.\n';
  const result = buildInlineChanges(old, current, 'docs/guide.mdx');
  expect(result.changed).toBe(true);
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  expect(result.changes.added).toEqual([{ start: 3, end: 3 }]);
  expect(result.changes.removed.map((r) => r.markdown)).toEqual([
    'A paragraph with **old** wording\nand a second line.',
    '```ts\nconst value = 1;\n```',
  ]);
  expect(result.changes.removed[0].beforeLine).toBe(3);
  expect(result.changes.sourceHash).toHaveLength(64);
});

it('keeps metadata changes out of deleted prose, and handles EOF and CRLF', () => {
  const result = buildInlineChanges(
    '---\ntitle: Old\n---\n\nSame\n',
    '---\ntitle: New\n---\n\nSame\n',
    'docs/page.md',
  );
  expect(result).toMatchObject({ changed: true, changes: { metadataChanged: true, removed: [] } });
  expect(buildInlineChanges('Same\n', 'Same\n', 'docs/page.md')).toEqual({ changed: false });
  expect(buildInlineChanges('Same\r\n', 'Changed', 'docs/page.md')).toMatchObject({
    changed: true,
    changes: { additions: 1, deletions: 1 },
  });
  expect(buildInlineChanges('Binary\0', 'Text', 'docs/page.md')).toMatchObject({
    unavailable: 'binary',
  });
});

it('reads fresh staged and working edits relative to HEAD, and clears after commit', async () => {
  const r = repo();
  r.write('docs/page.mdx', '# Page\n\nOriginal\n');
  r.commit();
  expect(await readPageChanges(r.options, 'docs/page.mdx')).toEqual({ changed: false });
  r.write('docs/page.mdx', '# Page\n\nStaged\n');
  r.git('add', '.');
  r.write('docs/page.mdx', '# Page\n\nWorking copy\n');
  const indexBefore = r.git('write-tree');
  const result = await readPageChanges(r.options, 'docs/page.mdx');
  expect(result).toMatchObject({
    changed: true,
    changes: { removed: [{ markdown: 'Original' }], additions: 1, deletions: 1 },
  });
  expect(JSON.stringify(result)).not.toContain('Staged');
  expect(r.git('write-tree')).toBe(indexBefore);
  r.commit();
  expect(await readPageChanges(r.options, 'docs/page.mdx')).toEqual({ changed: false });
});

it('covers new pages on an unborn branch and renamed pages without creation diffs', async () => {
  const r = repo();
  r.write('docs/新页面.md', 'First\n');
  expect(await readPageChanges(r.options, 'docs/新页面.md')).toMatchObject({
    changed: true,
    changes: { additions: 1, deletions: 0 },
  });
  r.git('add', '.');
  expect(await readPageChanges(r.options, 'docs/新页面.md')).toMatchObject({
    changed: true,
    changes: { additions: 1, deletions: 0 },
  });
  r.commit();
  r.git('mv', 'docs/新页面.md', 'docs/new.mdx');
  expect(await readPageChanges(r.options, 'docs/new.mdx')).toEqual({ changed: false });
  r.write('docs/new.mdx', 'Changed\n');
  expect(await readPageChanges(r.options, 'docs/new.mdx')).toMatchObject({
    changed: true,
    changes: { removed: [{ markdown: 'First' }] },
  });
});

it('handles intent-to-add and staged deletion followed by a recreated file', async () => {
  const r = repo();
  r.write('docs/base.md', 'Base\n');
  r.commit();
  r.write('docs/new.md', 'New\n');
  r.git('add', '-N', 'docs/new.md');
  expect(await readPageChanges(r.options, 'docs/new.md')).toMatchObject({
    changed: true,
    changes: { additions: 1, deletions: 0 },
  });
  r.git('rm', 'docs/base.md');
  r.write('docs/base.md', 'Base\n');
  expect(await readPageChanges(r.options, 'docs/base.md')).toEqual({ changed: false });
});

it('supports literal unusual filenames and never reads outside the content scope', async () => {
  const r = repo();
  const file = 'docs/:odd [名字]\n.md';
  r.write(file, 'Before\n');
  r.write('secret.md', 'Private\n');
  r.commit();
  r.write(file, 'After\n');
  expect(await readPageChanges(r.options, file)).toMatchObject({ changed: true });
  await expect(readPageChanges(r.options, '../secret.md')).rejects.toThrow('Invalid document');
  await expect(readPageChanges(r.options, 'secret.md')).rejects.toThrow('not found');
  r.git('mv', 'secret.md', 'docs/from-outside.md');
  const result = await readPageChanges(r.options, 'docs/from-outside.md');
  expect(result).toMatchObject({ changed: true, changes: { deletions: 0, removed: [] } });
  expect(JSON.stringify(result)).not.toContain('Private');
  symlinkSync(path.join(r.root, 'secret-target.md'), path.join(r.root, 'docs/link.md'));
  r.write('secret-target.md', 'Outside');
  await expect(readPageChanges(r.options, 'docs/link.md')).rejects.toThrow('regular documents');
});

it('reports bounded fallback states and merge conflicts without rendering uncertain content', async () => {
  const r = repo();
  r.write('docs/page.md', 'Base\n');
  r.commit();
  r.write('docs/page.md', 'Long source\n');
  expect(await readPageChanges({ ...r.options, maxBytes: 3 }, 'docs/page.md')).toMatchObject({
    unavailable: 'too-large',
  });
  r.write('docs/page.md', 'Binary\0');
  expect(await readPageChanges(r.options, 'docs/page.md')).toMatchObject({ unavailable: 'binary' });
  r.git('checkout', '--', 'docs/page.md');
  r.git('checkout', '-b', 'feature');
  r.write('docs/page.md', 'Feature\n');
  r.commit();
  r.git('checkout', 'main');
  r.write('docs/page.md', 'Main\n');
  r.commit();
  expect(() => r.git('-c', 'commit.gpgsign=false', 'merge', 'feature')).toThrow();
  expect(await readPageChanges(r.options, 'docs/page.md')).toMatchObject({
    unavailable: 'conflict',
  });
});

it('serves only local same-origin development requests, with no cache or local path leaks', async () => {
  const r = repo();
  r.write('docs/page.md', 'Base\n');
  r.commit();
  r.write('docs/page.md', 'Current\n');
  const handler = createWorkspaceHandler(r.options);
  const url = 'http://localhost/api/page-changes?path=docs%2Fpage.md';
  vi.stubEnv('NODE_ENV', 'production');
  expect((await handler(new Request(url))).status).toBe(404);
  vi.stubEnv('NODE_ENV', 'development');
  const response = await handler(new Request(url));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).not.toContain(r.root);
  expect(
    (await handler(new Request(url, { headers: { Origin: 'https://evil.example' } }))).status,
  ).toBe(403);
  expect(
    (await handler(new Request(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))).status,
  ).toBe(403);
  expect((await handler(new Request(url.replace('localhost', 'rebind.example')))).status).toBe(403);
  expect((await handler(new Request(url, { method: 'POST' }))).status).toBe(405);
  expect((await handler(new Request('http://localhost/api/page-changes'))).status).toBe(400);
});
