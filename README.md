# fumadocs-page-history

Per-page Git history and contributors for Fumadocs. A community-maintained integration inspired by [Nolebase Git Changelog](https://nolebase-integrations.ayaka.io/pages/en/integrations/git-changelog/).

[Documentation](https://fumadocs-page-history.vercel.app/docs) · [Live demo](https://fumadocs-page-history.vercel.app/docs/demo)

- Automatically append contributors and history with MDX or Sätteri.
- Enable each section independently, globally or per page.
- Follow file renames, credit co-authors, and display release tags.
- Use Fumadocs components, themes, accessible collapse controls, and translations.
- Optionally show uncommitted edits directly in rendered documents during local development.
- Optionally resolve GitHub avatars and profile links at build time, with caching and bounded requests.

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

For a migration that rewrites a page too heavily for Git to detect a rename, use the build-time `getHistoryPaths` option to return additional paths relative to the Git root:

```ts
getHistoryPaths: (sourcePath) =>
  sourcePath === 'docs/about/introduction.mdx'
    ? ['docs/about/introduction.md']
    : [],
```

The current path is always included. Histories follow actual renames, preserve page creation and independent edits made during merges, and do not follow template copies. Pure merges that keep the page identical to any parent are omitted; their branch commits are still followed. Results are deduplicated by SHA and sorted by author date before limiting. The same option is available to both compiler plugins, `createHistoryReader`, and `readPageHistory`; no migration paths are guessed.

See [Setup](https://fumadocs-page-history.vercel.app/docs), [Configuration](https://fumadocs-page-history.vercel.app/docs/configuration), and [Troubleshooting](https://fumadocs-page-history.vercel.app/docs/troubleshooting). Both Radix UI and Base UI are supported. Sätteri uses `gitChangelog` from `fumadocs-page-history/satteri` with the same settings.

## Inline changes during development

Enable `workspaceChanges: true` beside `repository` in the compiler plugin options. Add a local Next.js endpoint:

```ts
// app/api/page-changes/route.ts
import { createWorkspaceHandler } from 'fumadocs-page-history/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createWorkspaceHandler({ contentDirectory: 'content/docs' });
```

`contentDirectory` is relative to the Git root. A custom URL can be set with `workspaceChanges: { endpoint: '/api/page-changes' }`.

While running the development server, paragraph edits show shared text once and mark only removed words in red and added words in green, directly in the normal document. Entirely added or removed blocks receive the corresponding background; adding a table row highlights only that row. There are no line numbers or separate comparison views. Changes compare the latest commit with the current source, including staged and unstaged edits. They refresh every three seconds and when the window regains focus, so committing or reverting clears the markers without restarting the server.

Production builds keep normal documents and metadata-only history. The endpoint returns 404 outside development and accepts only same-origin localhost requests. Sources over 200 KB, binary content and merge conflicts show a fallback. See [Configuration](https://fumadocs-page-history.vercel.app/docs/configuration#inline-workspace-changes) for details.

The public [Demo](https://fumadocs-page-history.vercel.app/docs/demo#inline-workspace-changes) includes saved, interactive examples of inline changes. It uses the real comparison and rendering components with fixed source documents, so visitors can see the effect without a local Git checkout.

## Workspace

```text
packages/fumadocs-page-history/  Package, CSS, and tests
docs/                           Fumadocs documentation and interactive demo
.changeset/                     Package version notes
.github/workflows/ci.yml         Validation and documentation deployment
```

The workspace follows the package-and-docs layout used by [Typesense's Fumadocs adapter](https://github.com/typesense/typesense-fumadocs-adapter), using pnpm. The docs app consumes the local package through `workspace:*`; all Fumadocs dependencies come from npm.

```sh
pnpm install
pnpm docs-dev        # http://127.0.0.1:3013
pnpm check           # format, lint, tests, types, package and docs build
```

`pnpm docs-dev` builds the package before starting Next.js. When editing package code, run `pnpm --filter fumadocs-page-history dev` in another terminal. Restart the docs server after Git-only changes.

The demo uses a saved snapshot of this project's public Git history with shenxianovo's GitHub profile, so displaying its history does not require a token. Other docs pages use this repository's actual Git history. An optional `GITHUB_TOKEN` can be supplied to the docs build to resolve authors of commits already available in its configured GitHub repository.

## Releases

Use `pnpm changeset` for package changes. To release, run `pnpm changeset version`, commit the updated package version and changelog, and push that commit to `main`. Then create and push a matching version tag:

```sh
git tag v0.3.0
git push origin v0.3.0
```

Replace `v0.3.0` with `v` followed by the version in `packages/fumadocs-page-history/package.json`. Tags must point to commits on `main`; published versions cannot be reused. CI runs the complete validation and package inspection before publishing to npm. Stable releases use the `latest` dist-tag; prereleases such as `v0.3.0-beta.1` use `next`. Pushing a branch or opening a pull request does not publish a package.

Publishing uses [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) from GitHub Actions. Configure the package's trusted publisher once on npm with:

| Field                | Value                                       |
| -------------------- | ------------------------------------------- |
| Organization or user | `shenxianovo`                               |
| Repository           | `fumadocs-page-history`                     |
| Workflow filename    | `ci.yml`                                    |
| Environment name     | Leave empty                                 |
| Allowed action       | Enable direct publishing with `npm publish` |

No npm token secret is needed. If you prefer the npm CLI, log in with an account that has package write access and 2FA enabled, then run:

```sh
npm trust github fumadocs-page-history --repository shenxianovo/fumadocs-page-history --file ci.yml --allow-publish
```

Complete the first publish within two days of configuring the trusted publisher; otherwise npm expires the configuration and it must be created again.

## Documentation deployment

After validation passes, pushes to `main` deploy the docs and demo to Vercel. Pull requests only run validation. GitHub Actions builds from a complete Git checkout and uploads the prebuilt output; Vercel's automatic Git deployments are disabled to avoid duplicate deployments.

The Vercel project uses the `docs` root directory with files outside the root directory included, the Next.js preset, and Node.js 24. Build settings are in `docs/vercel.json`.

During the upstream guide migration, [the legacy documentation site](https://fumadocs-git-changelog.vercel.app) serves the fixed `v0.1.1` snapshot from a separate Vercel project. CI updates the new Page History site. Keep the legacy deployment available until the upstream documentation update has been submitted.

GitHub Actions requires the repository variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, and the repository secret `VERCEL_TOKEN`. The docs build uses the workflow's read-only `GITHUB_TOKEN` for optional author lookup.

## License and credits

MIT. See [LICENSE](LICENSE) and [NOTICE](packages/fumadocs-page-history/NOTICE). Originally developed as an integration proposal for Fumadocs; maintained independently as a community package.
