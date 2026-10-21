import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { createFooter, type GitChangelogOptions } from './plugins/shared';
import type { ChangelogFrontmatter } from './index';
import { createWorkspaceWrapper } from './plugins/workspace';

export type { GitChangelogOptions } from './plugins/shared';

/** Append Git history to every Markdown/MDX document at compile time. */
export const remarkGitChangelog: Plugin<[GitChangelogOptions], Root> = (options) => {
  const footer = createFooter(options);
  const wrap = createWorkspaceWrapper(options);
  return async (tree, file) => {
    const children = await wrap(file.path, tree);
    if (children) tree.children = children;
    const nodes = await footer(
      file.path,
      (file.data.frontmatter ?? {}) as ChangelogFrontmatter,
      tree,
    );
    if (!nodes) return;
    tree.children.unshift(nodes[0]);
    tree.children.push(...nodes.slice(1));
  };
};
