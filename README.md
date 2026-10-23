# fumadocs-page-history

Show each page's Git history and contributors at the bottom of your Fumadocs pages. A community-maintained integration inspired by [Nolebase Git Changelog](https://nolebase-integrations.ayaka.io/pages/en/integrations/git-changelog/).

[Documentation](https://fumadocs-page-history.vercel.app/docs) · [Demo](https://fumadocs-page-history.vercel.app/docs/demo)

- Adds contributors and a collapsible commit list to every page, with MDX or Sätteri and no layout changes.
- Follows renamed files, credits co-authors, and shows release tags.
- Turns each section on or off for the whole site or for a single page.
- Uses Fumadocs components, themes, and translations, with Chinese labels included.
- Shows GitHub avatars through author mappings, or through cached API lookups during the build.
- Optionally highlights your uncommitted edits in the rendered page while you write.

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

Every committed page now ends with its contributors and history. History is read from Git during the build, so the deployed site doesn't need Git, but CI needs a full checkout (`fetch-depth: 0` in GitHub Actions).

The [package README](packages/fumadocs-page-history/README.md) covers GitHub avatars, migrated pages, and highlighting uncommitted edits. The [documentation](https://fumadocs-page-history.vercel.app/docs) covers everything else.

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

`pnpm docs-dev` builds the package before starting Next.js. While you edit package code, run `pnpm --filter fumadocs-page-history dev` in another terminal to rebuild it on save. Restart the docs server after you commit, so pages pick up the new history.

The demo shows a saved snapshot of this repository's history, so it needs no token. The other pages use the live Git history. To show GitHub accounts for their authors, pass a `GITHUB_TOKEN` to the docs build.

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

[The old documentation site](https://fumadocs-git-changelog.vercel.app) still serves the `v0.1.1` docs from a separate Vercel project, and CI doesn't touch it. Keep it online until the upstream documentation update has been submitted.

GitHub Actions requires the repository variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, and the repository secret `VERCEL_TOKEN`. The docs build uses the workflow's read-only `GITHUB_TOKEN` for optional author lookup.

## License and credits

MIT. See [LICENSE](LICENSE) and [NOTICE](packages/fumadocs-page-history/NOTICE). This started as a proposed Fumadocs integration and is now maintained independently as a community package.
