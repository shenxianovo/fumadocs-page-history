import { loader } from 'fumadocs-core/source';
import { pageSchema } from 'fumadocs-core/source/schema';
import { defineDocs } from 'fumadocs-mdx/macro';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import { remarkGitChangelog } from 'fumadocs-page-history/remark';
import { gitChangelogSchema } from 'fumadocs-page-history/schema';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend(gitChangelogSchema.shape),
    mdxOptions: applyMdxPreset({
      remarkPlugins: [
        [
          remarkGitChangelog,
          {
            repository: { url: 'https://github.com/shenxianovo/fumadocs-page-history' },
            authorMappings: [{ gitName: 'shenxianovo', githubUsername: 'shenxianovo' }],
            maxGitLogCount: 12,
            workspaceChanges: true,
            filter: (file: string) => !/[\\/]demo\.mdx$/.test(file),
            ...(process.env.GITHUB_TOKEN
              ? {
                  github: {
                    token: process.env.GITHUB_TOKEN,
                    cacheDir: 'docs/.next/cache/git-changelog',
                  },
                }
              : {}),
            display: { commitsRelativeTime: true },
          },
        ],
      ],
    }),
  },
});

export const source = loader({ baseUrl: '/docs', source: docs.toFumadocsSource() });
