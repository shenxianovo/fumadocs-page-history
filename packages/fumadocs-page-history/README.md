# fumadocs-page-history

Per-page Git history and contributor attribution for Fumadocs. A community-maintained integration.

## Quick start

Requires Node.js 24.14+, Fumadocs 16.17+, and Git with a complete checkout.

```sh
pnpm add fumadocs-page-history
```

Import the stylesheet after your Fumadocs styles:

```css
@import 'fumadocs-page-history/css/preset.css';
```

Register the compiler plugin. The repository URL is the only required setting:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkGitChangelog } from 'fumadocs-page-history/remark';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [
        remarkGitChangelog,
        {
          repository: { url: 'https://github.com/owner/repository' },
        },
      ],
    ],
  },
});
```

Each committed document gets contributors and a collapsible history after its body. No page-template changes are needed. Register the plugin in the documentation collection if your site also compiles other MDX content.

To associate a Git author with a GitHub account, add an optional mapping:

```ts
{
  repository: { url: 'https://github.com/owner/repository' },
  authorMappings: [
    { gitName: 'Alex', githubUsername: 'alex' },
  ],
}
```

Mappings supply profile links and avatars without GitHub API requests. Without mappings, GitHub noreply emails supply accounts; other authors appear with their Git names and initials.

Dates use the reader's browser time zone. Server HTML starts in UTC and switches after hydration. For Chinese labels and dates, follow the [Chinese setup](https://fumadocs-page-history.vercel.app/docs/localization).

History is collected at compilation time. New files need a first commit; restart the development server after Git-only changes. Use a complete checkout (`fetch-depth: 0` in GitHub Actions). The deployed site does not need Git.

For migrations that rewrite a page too heavily for Git to detect a rename, explicitly include its previous paths:

```ts
{
  repository: { url: 'https://github.com/owner/repository' },
  getHistoryPaths: (sourcePath) =>
    sourcePath === 'docs/about/introduction.mdx'
      ? ['docs/about/introduction.md']
      : [],
}
```

The callback receives a normalized path relative to the Git root and returns additional repository-relative paths. The current path is always included. Histories follow actual renames, keep page creation and independent edits made during merges, and do not follow template copies. Pure merges that keep the page identical to any parent are omitted; their branch commits are still followed. Results are deduplicated by SHA and sorted by author date before `maxGitLogCount` is applied. The callback and paths stay in the build process. The same option works with `createHistoryReader` and `readPageHistory` from `fumadocs-page-history/git`; no `.md`/`.mdx` relationship is assumed by default.

See [Setup](https://fumadocs-page-history.vercel.app/docs), [Configuration](https://fumadocs-page-history.vercel.app/docs/configuration), and [Troubleshooting](https://fumadocs-page-history.vercel.app/docs/troubleshooting). Both Radix UI and Base UI are supported. Sätteri uses `gitChangelog` from `fumadocs-page-history/satteri` with the same settings.

Inspired by [Nolebase Git Changelog](https://nolebase-integrations.ayaka.io/pages/en/integrations/git-changelog/); see [NOTICE](./NOTICE).

## Inline changes during development

Add `workspaceChanges: true` to the compiler plugin settings and register a local endpoint:

```ts
// app/api/page-changes/route.ts
import { createWorkspaceHandler } from 'fumadocs-page-history/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createWorkspaceHandler({ contentDirectory: 'content/docs' });
```

`contentDirectory` is relative to the Git root. Paragraph edits keep shared text once and mark removed words in red and added words in green; new table rows are highlighted individually. Complex content uses a block-level fallback. There are no line numbers or a separate viewer. It compares HEAD with the working source, including staged edits. Git state refreshes every three seconds and on window focus.

Production builds omit inline comparisons, and the endpoint returns 404 outside local development. See [Configuration](https://fumadocs-page-history.vercel.app/docs/configuration#inline-workspace-changes).
