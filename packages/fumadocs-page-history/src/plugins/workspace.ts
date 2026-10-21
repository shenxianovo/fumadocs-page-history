import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Root, RootContent } from 'mdast';
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
    const ranges: { start: number; end: number; text?: string }[] = [];
    const children: RootContent[] = [];
    // Satteri nodes are live handles. Materialize before removing/reinserting
    // them so nested children are not references to removed native nodes.
    const materialized = JSON.parse(serialized) as Root;
    for (const node of materialized.children) {
      if (node.type === 'mdxjsEsm' || node.type === 'yaml') {
        imports.push(node);
        continue;
      }
      if (!node.position) {
        children.push(node);
        continue;
      }
      const index = ranges.length;
      const text = paragraphText(node);
      ranges.push({
        start: node.position.start.line,
        end: node.position.end.line,
        ...(text !== undefined ? { text } : {}),
      });
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
      children.push({
        type: 'mdxJsxFlowElement',
        name: block,
        attributes: [attr('index', index), ...(node.type === 'table' ? [attr('table', true)] : [])],
        children: [node],
      } as MdxJsxFlowElement);
    }
    const names = [
      ['GitPageChanges', provider],
      ['GitChangeBlock', block],
      ['GitChangeText', textComponent],
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
