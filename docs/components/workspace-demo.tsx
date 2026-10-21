import type { ReactNode } from 'react';
import { GitChangeBlock, GitChangeText } from 'fumadocs-page-history/ui';
import type { SourceRange } from 'fumadocs-page-history';
import { buildInlineChanges } from '../../packages/fumadocs-page-history/src/workspace/inline';
import { WorkspacePreview, type WorkspaceExample } from './workspace-preview';

type Part = string | { text: string; href: string };
type Document = { markdown: string; range: SourceRange; body: ReactNode };

function paragraph(parts: Part[]): Document {
  let offset = 0;
  const children = parts.map((part, index) => {
    const value = typeof part === 'string' ? part : part.text;
    const text = <GitChangeText key={index} index={0} start={offset} value={value} />;
    offset += value.length;
    return typeof part === 'string' ? (
      text
    ) : (
      <a key={index} href={part.href}>
        {text}
      </a>
    );
  });
  return {
    markdown:
      parts
        .map((part) => (typeof part === 'string' ? part : `[${part.text}](${part.href})`))
        .join('') + '\n',
    range: {
      start: 1,
      end: 1,
      text: parts.map((part) => (typeof part === 'string' ? part : part.text)).join(''),
    },
    body: (
      <GitChangeBlock index={0}>
        <p>{children}</p>
      </GitChangeBlock>
    ),
  };
}

function table(headers: string[], rows: string[][]): Document {
  const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return {
    markdown: [row(headers), row(headers.map(() => '---')), ...rows.map(row)].join('\n') + '\n',
    range: { start: 1, end: rows.length + 2 },
    body: (
      <GitChangeBlock index={0} table>
        <table>
          <thead>
            <tr data-git-row-start={1} data-git-row-end={1}>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, index) => (
              <tr key={index} data-git-row-start={index + 3} data-git-row-end={index + 3}>
                {cells.map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </GitChangeBlock>
    ),
  };
}

function example(
  id: string,
  label: string,
  description: string,
  previous: string,
  current: Document,
): WorkspaceExample {
  const result = buildInlineChanges(previous, current.markdown, `examples/${id}.md`);
  if (!result.changed || !('changes' in result)) throw new Error(`Invalid demo fixture: ${id}`);
  return {
    id,
    label,
    description,
    changes: result.changes,
    ranges: [current.range],
    body: current.body,
  };
}

// Public examples use the real comparison and UI, with fixed sources rather than local Git data.
const examples = [
  example(
    'expanded-paragraph',
    'Expanded paragraph',
    'Shared text appears once, even when the replacement makes the paragraph much longer.',
    'Both compiler plugins accept the same settings. Start with the [minimal setup](/docs); most sites need only `repository.url`.\n',
    paragraph([
      'Both compiler plugins accept the same settings. Start with the ',
      { text: 'minimal setup', href: '/docs' },
      ' for history and contributors; enable inline workspace changes when reviewing uncommitted edits in your local documentation site.',
    ]),
  ),
  example(
    'chinese-words',
    'Chinese words',
    'Chinese replacements keep whole words together.',
    '使用应用程序读取观测数据。\n',
    paragraph(['使用应用进程读取观测数据。']),
  ),
  example(
    'rewritten-paragraph',
    'Rewritten paragraph',
    'A full rewrite keeps the old and new paragraphs readable instead of mixing unrelated words.',
    'Documentation is published after a manual review.\n',
    paragraph(['Every update appears immediately while you browse your local documentation.']),
  ),
  example(
    'new-table-row',
    'New table row',
    'Only the inserted row is green. Existing rows keep their normal appearance.',
    table(['Option', 'Value'], [['Page history', 'Enabled']]).markdown,
    table(
      ['Option', 'Value'],
      [
        ['Page history', 'Enabled'],
        ['Workspace changes', 'Development only'],
      ],
    ),
  ),
  example(
    'replaced-table',
    'Replaced table',
    'Deleted content remains a table and aligns with its replacement.',
    table(['Option', 'Value'], [['Rendering', 'Entire paragraphs']]).markdown,
    table(
      ['Behavior', 'Result'],
      [
        ['Paragraph edits', 'Changed words'],
        ['New table rows', 'Only the new row'],
      ],
    ),
  ),
  example(
    'link-destination',
    'Link destination',
    'The paragraph appears once. Hover over the highlighted link to inspect the old and new destinations.',
    'Read the [setup guide](/docs/localization) before adding the plugin.\n',
    paragraph([
      'Read the ',
      { text: 'setup guide', href: '/docs/configuration' },
      ' before adding the plugin.',
    ]),
  ),
];

export function WorkspaceDemo() {
  return <WorkspacePreview examples={examples} />;
}
