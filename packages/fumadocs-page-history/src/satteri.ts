import { fileURLToPath } from 'node:url';
import type { MdastPluginDefinition } from 'satteri';
import { createFooter, type GitChangelogOptions } from './plugins/shared';
import type { ChangelogFrontmatter } from './index';
import { createWorkspaceWrapper } from './plugins/workspace';

export type { GitChangelogOptions } from './plugins/shared';

/** Sätteri counterpart of remarkGitChangelog, with the same options. */
export function gitChangelog(options: GitChangelogOptions): MdastPluginDefinition {
  const footer = createFooter(options);
  const wrap = createWorkspaceWrapper(options);
  return {
    name: 'git-changelog',
    async after(root, ctx) {
      const file = ctx.fileURL ? fileURLToPath(ctx.fileURL) : '';
      const children = await wrap(file, root);
      if (children) {
        for (const child of root.children) ctx.removeNode(child);
        for (const child of children) ctx.appendChild(root, child);
      }
      const nodes = await footer(file, (ctx.data.frontmatter ?? {}) as ChangelogFrontmatter, root);
      if (!nodes) return;
      ctx.prependChild(root, nodes[0]);
      for (const node of nodes.slice(1)) ctx.appendChild(root, node);
    },
  };
}
