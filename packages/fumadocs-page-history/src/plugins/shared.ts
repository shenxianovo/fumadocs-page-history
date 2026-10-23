import path from 'node:path';
import { valueToEstree } from 'estree-util-value-to-estree';
import type { Heading, Nodes, Root } from 'mdast';
import GithubSlugger from 'github-slugger';
import { toString } from 'mdast-util-to-string';
import type { MdxjsEsm, MdxJsxFlowElement } from 'mdast-util-mdx';
import { createHistoryReader, resolveAuthors, type HistoryOptions } from '../git';
import { shouldShowChangelog, shouldShowContributors, type ChangelogFrontmatter } from '../index';
import type { GitChangelogProps } from '../ui/changelog';
import { resolveContentPath, type ContentLocation } from '../paths';

export interface GitChangelogOptions extends HistoryOptions {
  /** Inline HEAD-to-working-source changes in local development only. */
  workspaceChanges?: boolean | { endpoint?: string };
  /** Optional location mapping for documents copied outside their checkout. */
  content?: ContentLocation;
  /** Select documents by their absolute source path. Defaults to every document. */
  filter?: (filePath: string) => boolean;
  /** Serializable UI defaults, shared by every injected footer. */
  display?: Omit<GitChangelogProps, 'commits' | 'authors' | 'repository'>;
}

/**
 * Anchors the page already uses: heading slugs and explicit ids. Prose that merely
 * mentions "Git history" must not push the footer anchors to `git-history-1`.
 */
function collectIds(tree: Root): Set<string> {
  const ids = new Set<string>();
  // Mirror Fumadocs' per-page slugger, which suffixes repeated headings.
  const slugger = new GithubSlugger();
  function visit(node: Nodes) {
    const id = (node.data as { hProperties?: { id?: unknown } } | undefined)?.hProperties?.id;
    if (typeof id === 'string') ids.add(id);
    else if (node.type === 'heading') {
      // Headings not yet processed by remark-heading may carry a `[#custom-id]` suffix.
      const text = toString(node);
      ids.add(/\[#([^\]\s]+)\]\s*$/.exec(text)?.[1] ?? slugger.slug(text.trim()));
    }
    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      for (const attribute of node.attributes)
        if (
          attribute.type === 'mdxJsxAttribute' &&
          attribute.name === 'id' &&
          typeof attribute.value === 'string'
        )
          ids.add(attribute.value);
    } else if (node.type === 'html') {
      for (const [, value] of node.value.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) ids.add(value);
    }
    if ('children' in node) for (const child of node.children) visit(child as Nodes);
  }
  visit(tree);
  return ids;
}

/** Build-time only: no Git options, author mappings, or Node imports enter the generated module. */
export function createFooter(options: GitChangelogOptions) {
  let reader: ReturnType<typeof createHistoryReader> | undefined;
  const reported = new Set<string>();
  return async function footer(
    filePath: string,
    frontmatter: ChangelogFrontmatter,
    tree: Root,
  ): Promise<[MdxjsEsm, ...(Heading | MdxJsxFlowElement)[]] | undefined> {
    if (!filePath) throw new Error('Git changelog requires a source file path.');
    const absolutePath = path.resolve(filePath);
    if (options.filter && !options.filter(absolutePath)) return;
    const showChangelog = shouldShowChangelog(frontmatter);
    const showContributors =
      shouldShowContributors(frontmatter) && options.display?.showContributors !== false;
    if (!showChangelog && !showContributors) return;

    reader ??= createHistoryReader({
      ...options,
      repository: {
        ...options.repository,
        directory: options.repository.directory ?? path.dirname(absolutePath),
      },
    });
    const root = await reader.getRoot();
    const gitPath = resolveContentPath(absolutePath, root, options.content);
    const commits = await reader.read(gitPath);
    const authors = resolveAuthors(frontmatter.authors ?? [], options.authorMappings);
    // New, untracked documents have no published history to show yet.
    if (commits.length === 0 && authors.length === 0) {
      if (process.env.NODE_ENV === 'development' && !reported.has(absolutePath)) {
        reported.add(absolutePath);
        console.info(
          `[fumadocs-page-history] No Git history for ${gitPath}; skipping the footer. New pages show history after their first commit. Restart the dev server after Git-only changes.`,
        );
      }
      return;
    }

    const source = JSON.stringify(tree);
    const component = showChangelog ? 'GitChangelog' : 'GitContributors';
    let localName = '_FumadocsGitChangelog';
    while (source.includes(localName)) localName += '_';
    const labelName = `${localName}Label`;
    const takenIds = collectIds(tree);
    const uniqueId = (base: string) => {
      let id = base;
      while (takenIds.has(id)) id += '-1';
      return id;
    };
    const historyId = options.display?.id ?? uniqueId('git-history');
    const contributorsId =
      (showChangelog ? options.display?.contributorsId : options.display?.id) ??
      uniqueId('git-contributors');
    const headings: Heading[] = [];
    function addHeading(section: 'contributors' | 'history', id: string) {
      headings.push({
        type: 'heading',
        depth: 2,
        data: { hProperties: { id } },
        children: [
          {
            type: 'mdxJsxTextElement',
            name: labelName,
            attributes: [{ type: 'mdxJsxAttribute', name: 'section', value: section }],
            children: [],
          },
          // Native Fumadocs TOC-only headings are removed from the body by rehype-toc.
          { type: 'text', value: '[toc]' },
        ],
      });
    }
    if (showContributors && !options.display?.hideContributorsHeader)
      addHeading('contributors', contributorsId);
    if (showChangelog && !options.display?.hideChangelogHeader) addHeading('history', historyId);
    const props = showChangelog
      ? {
          ...options.display,
          commits,
          authors,
          repository: { url: options.repository.url },
          showContributors,
          id: historyId,
          contributorsId,
        }
      : {
          commits,
          authors,
          locale: options.display?.locale,
          hideContributorsHeader: options.display?.hideContributorsHeader,
          id: contributorsId,
          className: options.display?.className,
        };
    const moduleName = 'fumadocs-page-history/ui';
    return [
      {
        type: 'mdxjsEsm',
        value: `import { ${component} as ${localName}, GitChangelogLabel as ${labelName} } from '${moduleName}';`,
        data: {
          estree: {
            type: 'Program',
            sourceType: 'module',
            body: [
              {
                type: 'ImportDeclaration',
                attributes: [],
                source: { type: 'Literal', value: moduleName },
                specifiers: [
                  {
                    type: 'ImportSpecifier',
                    imported: { type: 'Identifier', name: component },
                    local: { type: 'Identifier', name: localName },
                  },
                  {
                    type: 'ImportSpecifier',
                    imported: { type: 'Identifier', name: 'GitChangelogLabel' },
                    local: { type: 'Identifier', name: labelName },
                  },
                ],
              },
            ],
          },
        },
      },
      ...headings,
      {
        type: 'mdxJsxFlowElement',
        name: localName,
        attributes: Object.entries(props)
          .filter(([, value]) => value !== undefined)
          .map(([name, value]) => ({
            type: 'mdxJsxAttribute',
            name,
            value: {
              type: 'mdxJsxAttributeValueExpression',
              value: JSON.stringify(value),
              data: {
                estree: {
                  type: 'Program',
                  sourceType: 'module',
                  body: [{ type: 'ExpressionStatement', expression: valueToEstree(value) }],
                },
              },
            },
          })),
        children: [],
      },
    ];
  };
}
