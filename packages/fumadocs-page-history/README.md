# fumadocs-page-history

Show each page's Git history and contributors at the bottom of your Fumadocs pages. A community-maintained integration.

[Documentation](https://fumadocs-page-history.vercel.app/docs) · [Demo](https://fumadocs-page-history.vercel.app/docs/demo)

## Quick start

You need Node.js 24.14+, Fumadocs 16.17+, and a Git checkout with full history.

```sh
pnpm add fumadocs-page-history
```

Import the stylesheet after your Fumadocs styles:

```css
@import 'fumadocs-page-history/css/preset.css';
```

Register the plugin. The repository URL is the only required option:

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

Every committed page now ends with its contributors and a collapsible list of commits. You don't need to change your page layout. If your site has other MDX collections, such as a blog, register the plugin in the docs collection only. For Sätteri, use `gitChangelog` from `fumadocs-page-history/satteri` with the same options. Both Radix UI and Base UI are supported.

History is read from Git during the build, so the deployed site doesn't need Git. After a new commit, restart the development server to see it. In CI, use a full checkout (`fetch-depth: 0` in GitHub Actions).

## GitHub avatars

By default, contributors appear with their Git names and initials, except for commits made with a GitHub noreply email. To show avatars and profile links for everyone, map Git authors to GitHub accounts:

```ts
{
  repository: { url: 'https://github.com/owner/repository' },
  authorMappings: [{ gitName: 'Alex', githubUsername: 'alex' }],
}
```

Mappings don't call the GitHub API. You can also [look up accounts through the API](https://fumadocs-page-history.vercel.app/docs/contributors#optional-github-lookup) during the build.

## Renamed and migrated pages

Renames that Git detects are followed automatically. If a migration changed a page so much that Git no longer sees a rename, list its old paths:

```ts
{
  repository: { url: 'https://github.com/owner/repository' },
  getHistoryPaths: (sourcePath) =>
    sourcePath === 'docs/about/introduction.mdx' ? ['docs/about/introduction.md'] : [],
}
```

Paths are relative to the Git root. See [Migration history](https://fumadocs-page-history.vercel.app/docs/configuration#migration-history).

## Highlight uncommitted edits

While you write, Page History can mark your uncommitted edits directly in the rendered page. Add `workspaceChanges: true` to the plugin options, then add a local API route:

```ts
// app/api/page-changes/route.ts
import { createWorkspaceHandler } from 'fumadocs-page-history/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createWorkspaceHandler({ contentDirectory: 'content/docs' });
```

`contentDirectory` is relative to the Git root. Each page is compared with its last commit, including staged and unstaged edits. Removed words are red and struck through, added words are green, and changed blocks get a bar on the left edge. Highlights update by themselves after you save, stage, or commit. Production builds contain none of this, and the route returns 404 outside development. See [Workspace changes](https://fumadocs-page-history.vercel.app/docs/workspace-changes).

## More

- [Display & language](https://fumadocs-page-history.vercel.app/docs/localization): display options and Chinese labels.
- [Configuration reference](https://fumadocs-page-history.vercel.app/docs/configuration): all options.
- [Troubleshooting](https://fumadocs-page-history.vercel.app/docs/troubleshooting): missing footers and outdated history.

Inspired by [Nolebase Git Changelog](https://nolebase-integrations.ayaka.io/pages/en/integrations/git-changelog/); see [NOTICE](./NOTICE).
