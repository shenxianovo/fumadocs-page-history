import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TranslationProvider } from '@fuma-translate/react';
import { GitPageChangesView, GitChangeBlock, GitChangeText } from '../src/ui';
import { buildInlineChanges } from '../src/workspace/inline';
import { zhCN } from '../src/i18n';

it('shows the Heartbeat paragraph once when only the link destination changes', () => {
  const label = '实体定义登记';
  const suffix =
    '同时保存定义、统一索引和业务资源绑定，并创建业务表。建表失败时，这些步骤必须一起回滚，避免留下无法使用的业务资源。';
  const previousUrl = '../../storage/entity-schemas.mdx#读写';
  const currentUrl = '../../storage/fixed-tables.mdx#entity_schemas';
  const result = buildInlineChanges(
    `[${label}](${previousUrl})${suffix}\n`,
    `[${label}](${currentUrl})${suffix}\n`,
    'docs/page.mdx',
  );
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  const html = renderToStaticMarkup(
    <GitPageChangesView
      changes={result.changes}
      ranges={[{ start: 1, end: 1, text: label + suffix }]}
    >
      <GitChangeBlock index={0}>
        <p>
          <a href="/storage/fixed-tables#entity_schemas">
            <GitChangeText index={0} start={0} value={label} />
          </a>
          <GitChangeText index={0} start={label.length} value={suffix} />
        </p>
      </GitChangeBlock>
    </GitPageChangesView>,
  );
  expect(html.match(/实体定义登记/g)).toHaveLength(1);
  expect(html).not.toContain('fgc-inline-removed');
  expect(html).toContain('data-change="link"');
  expect(html).toContain(previousUrl);
  expect(html).toContain(currentUrl);
  expect(html).toContain('href="/storage/fixed-tables#entity_schemas"');
});

it('keeps the existing fallback when formatting also changes with a link target', () => {
  const result = buildInlineChanges(
    'Read the [guide](/old).\n',
    'Read the **[guide](/new)**.\n',
    'docs/page.md',
  );
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  expect(result.changes.paragraphs).toEqual([]);
  expect(result.changes.removed[0].markdown).toBe('Read the [guide](/old).');
});

it('does not splice unrelated rewritten paragraphs together around incidental Chinese characters', () => {
  const previous =
    '三个 Observer 分别拥有实例身份。三个 Observer 可以运行在同一程序中。前台状态实例使用两份 EntitySchema，分别定义应用和标题事实。';
  const current =
    '已实现的离线导入与本机读取由 [Source Collector](./sources/index.mdx) 运行，前台状态由独立程序 `src/Observers/Heartbeat.Observer.ForegroundState/` 运行。';
  const result = buildInlineChanges(`${previous}\n`, `${current}\n`, 'docs/page.mdx');
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  expect(result.changes.paragraphs).toEqual([]);
  expect(result.changes.removed[0].markdown).toBe(previous);
});

it('compares Chinese words without splitting a shared character out of a replacement word', () => {
  const result = buildInlineChanges('使用应用程序读取。\n', '使用应用进程读取。\n', 'docs/page.md');
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  const paragraph = result.changes.paragraphs[0];
  expect(
    paragraph.segments
      .filter((part) => part.kind === 'removed')
      .map((part) => part.text)
      .join(''),
  ).toBe('程序');
  expect(
    paragraph.segments
      .filter((part) => part.kind === 'added')
      .map((part) => part.text)
      .join(''),
  ).toBe('进程');
  expect(
    paragraph.segments
      .filter((part) => part.kind !== 'added')
      .map((part) => part.text)
      .join(''),
  ).toBe('使用应用程序读取。');
  expect(
    paragraph.segments
      .filter((part) => part.kind !== 'removed')
      .map((part) => part.text)
      .join(''),
  ).toBe('使用应用进程读取。');
});

it('keeps a deleted GFM table as a table rather than merging its pipe syntax into paragraph changes', () => {
  const previous = '| Node | Meaning |\n| --- | --- |\n| IEntity | Old meaning |\n';
  const current = '| Order | Node |\n| --- | --- |\n| 1 | IEntity |\n';
  const result = buildInlineChanges(previous, current, 'docs/page.md');
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  const html = renderToStaticMarkup(
    <GitPageChangesView changes={result.changes} ranges={[{ start: 1, end: 3 }]}>
      <GitChangeBlock index={0} table>
        <table>
          <tbody>
            <tr>
              <td>1</td>
              <td>IEntity</td>
            </tr>
          </tbody>
        </table>
      </GitChangeBlock>
    </GitPageChangesView>,
  );
  expect(html).toMatch(/class="fgc-inline-removed"[^>]*><table>/);
  expect(html).toContain('<th>Meaning</th>');
  expect(html).toContain('<td>Old meaning</td>');
  expect(result.changes.paragraphs).toEqual([]);
});

it.each([
  ' for history and contributors.',
  ' for history and contributors; enable inline workspace changes when reviewing uncommitted edits in your local documentation site.',
])('keeps the shared prefix and current link once when a paragraph is expanded: %s', (suffix) => {
  const prefix = 'Both compiler plugins accept the same settings. Start with the ';
  const label = 'minimal setup';
  const old = `${prefix}[${label}](/docs); most sites need only \`repository.url\`.\n`;
  const current = `${prefix}[${label}](/docs)${suffix}\n`;
  const result = buildInlineChanges(old, current, 'docs/page.md');
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  const text = prefix + label + suffix;
  const html = renderToStaticMarkup(
    <GitPageChangesView changes={result.changes} ranges={[{ start: 1, end: 1, text }]}>
      <GitChangeBlock index={0}>
        <p>
          <GitChangeText index={0} start={0} value={prefix} />
          <a href="/docs">
            <GitChangeText index={0} start={prefix.length} value={label} />
          </a>
          <GitChangeText index={0} start={prefix.length + label.length} value={suffix} />
        </p>
      </GitChangeBlock>
    </GitPageChangesView>,
  );
  expect(html.match(/Both compiler plugins/g)).toHaveLength(1);
  expect(html.match(/href="\/docs"/g)).toHaveLength(1);
  expect(html).not.toContain('fgc-inline-removed');
  expect(html).toContain('data-change="removed"');
  expect(html).toContain('data-change="added"');
  expect(html).toContain('repository.url');
  expect(html.replace(/<[^>]*>/g, '')).toContain(suffix.slice(0, -1));
});

it('retains trailing deletions once at a formatting boundary', () => {
  const result = buildInlineChanges('Shared old\n', 'Shared\n', 'docs/page.md');
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  const html = renderToStaticMarkup(
    <GitPageChangesView changes={result.changes} ranges={[{ start: 1, end: 1, text: 'Shared' }]}>
      <GitChangeBlock index={0}>
        <p>
          <strong>
            <GitChangeText index={0} start={0} value="Sha" />
          </strong>
          <GitChangeText index={0} start={3} value="red" />
        </p>
      </GitChangeBlock>
    </GitPageChangesView>,
  );
  expect(html).toContain('<strong>Sha</strong>red');
  expect(html.match(/ old/g)).toHaveLength(1);
});

it('renders red deleted Markdown and green current content in document order without a separate view', () => {
  const result = buildInlineChanges(
    '# Page\n\n**Old** paragraph\n\nRemoved at end\n',
    '# Page\n\n**New** paragraph\n',
    'docs/page.md',
  );
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  const html = renderToStaticMarkup(
    <TranslationProvider translations={zhCN().value}>
      <GitPageChangesView
        changes={result.changes}
        ranges={[
          { start: 1, end: 1 },
          { start: 3, end: 3 },
        ]}
      >
        <GitChangeBlock index={0}>
          <h1 id="page">Page</h1>
        </GitChangeBlock>
        <GitChangeBlock index={1}>
          <p>
            <strong>New</strong> paragraph
          </p>
        </GitChangeBlock>
      </GitPageChangesView>
    </TranslationProvider>,
  );
  expect(html).toContain('aria-label="已删除的内容"');
  expect(html).toContain('<strong>Old</strong> paragraph');
  expect(html).toContain('data-change="added"');
  expect(html.indexOf('<strong>Old')).toBeLessThan(html.indexOf('<strong>New'));
  expect(html.indexOf('Removed at end')).toBeGreaterThan(html.indexOf('<strong>New'));
  expect(html.match(/id="page"/g)).toHaveLength(1);
  expect(html).not.toMatch(/<dialog|<table|line-number/);
});

it('keeps clean content unmarked and historical JSX inert', () => {
  const html = renderToStaticMarkup(
    <GitPageChangesView ranges={[{ start: 1, end: 3 }]}>
      <GitChangeBlock index={0}>
        <p>Unchanged body</p>
      </GitChangeBlock>
    </GitPageChangesView>,
  );
  expect(html).toContain('Unchanged body');
  expect(html).not.toContain('data-change=');
  const result = buildInlineChanges('<script>bad()</script>\n', 'New\n', 'docs/page.mdx');
  if (!result.changed || !('changes' in result)) throw new Error('Expected changes');
  const escaped = renderToStaticMarkup(
    <GitPageChangesView changes={result.changes} ranges={[{ start: 1, end: 1 }]}>
      <GitChangeBlock index={0}>
        <p>New</p>
      </GitChangeBlock>
    </GitPageChangesView>,
  );
  expect(escaped).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(escaped).not.toContain('<script>');
});
