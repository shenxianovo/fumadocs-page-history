'use client';

import Markdown from 'react-markdown';
import Link from 'fumadocs-core/link';
import { safeURL } from './shared';

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

function remarkIssues({ repositoryUrl }: { repositoryUrl?: string }) {
  return (tree: MarkdownNode) => {
    if (!safeURL(repositoryUrl)) return;
    function visit(node: MarkdownNode) {
      if (
        ['link', 'linkReference', 'image', 'imageReference', 'code', 'inlineCode', 'html'].includes(
          node.type,
        ) ||
        !node.children
      )
        return;
      node.children = node.children.flatMap((child): MarkdownNode[] => {
        if (child.type !== 'text') {
          visit(child);
          return [child];
        }
        return (child.value ?? '').split(/(\B#\d+\b)/g).map((part) =>
          /^#\d+$/.test(part)
            ? {
                type: 'link',
                url: `${repositoryUrl!.replace(/\/$/, '')}/issues/${part.slice(1)}`,
                children: [{ type: 'text', value: part }],
              }
            : { type: 'text', value: part },
        );
      });
    }
    visit(tree);
  };
}

/** Parse Markdown into React nodes, with no raw HTML and no links inside code or links. */
export function CommitMessage({
  message,
  repositoryUrl,
  inline = false,
}: {
  message: string;
  repositoryUrl?: string;
  inline?: boolean;
}) {
  const Wrapper = inline ? 'span' : 'div';
  return (
    <Wrapper className={inline ? 'fgc-message' : 'fgc-markdown'}>
      <Markdown
        skipHtml
        allowedElements={inline ? ['a', 'strong', 'em', 'code', 'del', 'br', 'img'] : undefined}
        unwrapDisallowed
        remarkPlugins={[[remarkIssues, { repositoryUrl }]]}
        components={{
          a: ({ href, children }) =>
            href ? <Link href={href}>{children}</Link> : <span>{children}</span>,
          img: ({ src, alt }) =>
            typeof src === 'string' && src ? (
              <img src={src} alt={alt ?? ''} loading="lazy" />
            ) : (
              <span>{alt}</span>
            ),
        }}
      >
        {message}
      </Markdown>
    </Wrapper>
  );
}
