import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Root, RootContent, List } from 'mdast';
import type { SourceRange } from '../index';
import type { MdxjsEsm, MdxJsxFlowElement } from 'mdast-util-mdx';
import { valueToEstree } from 'estree-util-value-to-estree';
import { createHistoryReader } from '../git';
import { resolveContentPath } from '../paths';
import { sourceHash } from '../workspace/inline';
import type { GitChangelogOptions } from './shared';
import { paragraphText } from '../workspace/text';

export function createWorkspaceWrapper(options: GitChangelogOptions) {
  let reader: ReturnType<typeof createHistoryReader> | undefined;
  return async (file: string, tree: Root): Promise<RootContent[] | undefined> => {
    if (!options.workspaceChanges || process.env.NODE_ENV !== 'development') return;
    const absolute = path.resolve(file);
    if (options.filter && !options.filter(absolute)) return;
    reader ??= createHistoryReader({
      ...options,
      repository: {
        ...options.repository,
        directory: options.repository.directory ?? path.dirname(absolute),
      },
    });
    const gitPath = resolveContentPath(absolute, await reader.getRoot(), options.content);
    const source = await readFile(absolute, 'utf8');
    const serialized = JSON.stringify(tree);
    let provider = '_FumadocsInlineChanges';
    while (serialized.includes(provider)) provider += '_';
    const block = `${provider}Block`;
    const textComponent = `${provider}Text`;
    const listComponent = `${provider}List`;
    const attr = (name: string, value: unknown) => ({
      type: 'mdxJsxAttribute' as const,
      name,
      value: {
        type: 'mdxJsxAttributeValueExpression' as const,
        value: JSON.stringify(value),
        data: {
          estree: {
            type: 'Program' as const,
            sourceType: 'module' as const,
            body: [{ type: 'ExpressionStatement' as const, expression: valueToEstree(value) }],
          },
        },
      },
    });
    const imports: RootContent[] = [];
    const ranges: SourceRange[] = [];
    const children: RootContent[] = [];
    // Satteri nodes are live handles. Materialize before removing/reinserting
    // them so nested children are not references to removed native nodes.
    const materialized = JSON.parse(serialized) as Root;
    function wrap(node: RootContent, list?: List, itemIndex = 0): RootContent {
      if (!node.position) return node;
      const index = ranges.length;
      const text = paragraphText(node);
      ranges.push({
        start: node.position.start.line,
        end: node.position.end.line,
        ...(node.type === 'list' ? { kind: 'list' as const } : {}),
        ...(list ? { kind: 'listItem' as const, listStart: list.position!.start.line } : {}),
        ...(text !== undefined ? { text } : {}),
      });
      if (node.type === 'list') {
        return {
          type: 'mdxJsxFlowElement',
          name: listComponent,
          attributes: [
            attr('key', index),
            attr('index', index),
            attr('ordered', !!node.ordered),
            attr('start', node.start ?? 1),
            attr(
              'className',
              node.children.some((item) => typeof item.checked === 'boolean')
                ? 'contains-task-list'
                : '',
            ),
          ],
          children: node.children.map((item, i) => wrap(item, node, i)),
        } as MdxJsxFlowElement;
      }
      if (text !== undefined) {
        let offset = 0;
        function decorate(parent: { children: unknown[] }) {
          parent.children = parent.children.map((entry) => {
            const child = entry as { type: string; value?: string; children?: unknown[] };
            if (child.type === 'text' || child.type === 'inlineCode') {
              const value = child.value ?? '';
              const start = offset;
              offset += value.length;
              return {
                type: 'mdxJsxTextElement',
                name: textComponent,
                attributes: [
                  attr('index', index),
                  attr('start', start),
                  attr('value', value),
                  attr('code', child.type === 'inlineCode'),
                ],
                children: [],
              };
            }
            if (child.children) decorate(child as { children: unknown[] });
            return child;
          });
        }
        decorate(node as { children: unknown[] });
      }
      if (node.type === 'table') {
        for (const row of node.children)
          if (row.position) {
            row.data ??= {};
            row.data.hProperties = {
              ...row.data.hProperties,
              'data-git-row-start': row.position.start.line,
              'data-git-row-end': row.position.end.line,
            };
          }
      }
      let content: MdxJsxFlowElement['children'] = [node] as MdxJsxFlowElement['children'];
      if (node.type === 'listItem' && list) {
        const first = node.children[0];
        if (typeof node.checked === 'boolean' && first?.type === 'paragraph') {
          first.children.unshift(
            {
              type: 'mdxJsxTextElement',
              name: 'input',
              attributes: [
                attr('type', 'checkbox'),
                attr('disabled', true),
                attr('checked', node.checked),
              ],
              children: [],
            },
            { type: 'text', value: ' ' },
          );
        }
        const loose = list.spread || list.children.some((item) => item.spread);
        content = node.children.map((child) =>
          !loose && child.type === 'paragraph'
            ? ({
                type: 'mdxJsxFlowElement',
                name: null,
                attributes: [],
                children: child.children,
              } as MdxJsxFlowElement)
            : child,
        );
      }
      return {
        type: 'mdxJsxFlowElement',
        name: block,
        attributes: [
          attr('key', index),
          attr('index', index),
          ...(node.type === 'table' ? [attr('table', true)] : []),
          ...(list
            ? [
                attr('listItem', true),
                ...(list.ordered ? [attr('value', (list.start ?? 1) + itemIndex)] : []),
                ...(node.type === 'listItem' && typeof node.checked === 'boolean'
                  ? [attr('className', 'task-list-item')]
                  : []),
              ]
            : []),
        ],
        children: content,
      } as MdxJsxFlowElement;
    }
    for (const node of materialized.children) {
      if (node.type === 'mdxjsEsm' || node.type === 'yaml') imports.push(node);
      else children.push(wrap(node));
    }
    const names = [
      ['GitPageChanges', provider],
      ['GitChangeBlock', block],
      ['GitChangeText', textComponent],
      ['GitChangeList', listComponent],
    ];
    const moduleName = 'fumadocs-page-history/ui';
    const esm: MdxjsEsm = {
      type: 'mdxjsEsm',
      value: `import { ${names.map(([name, local]) => `${name} as ${local}`).join(', ')} } from '${moduleName}';`,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [
            {
              type: 'ImportDeclaration',
              attributes: [],
              source: { type: 'Literal', value: moduleName },
              specifiers: names.map(([name, local]) => ({
                type: 'ImportSpecifier',
                imported: { type: 'Identifier', name },
                local: { type: 'Identifier', name: local },
              })),
            },
          ],
        },
      },
    };
    const endpoint =
      typeof options.workspaceChanges === 'object'
        ? (options.workspaceChanges.endpoint ?? '/api/page-changes')
        : '/api/page-changes';
    return [
      ...imports,
      esm,
      {
        type: 'mdxJsxFlowElement',
        name: provider,
        attributes: [
          attr('sourcePath', gitPath),
          attr('sourceHash', sourceHash(source)),
          attr('ranges', ranges),
          attr('endpoint', endpoint),
        ],
        children,
      } as MdxJsxFlowElement,
    ];
  };
}
