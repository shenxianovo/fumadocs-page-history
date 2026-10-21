import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import type { MDXComponents } from 'mdx/types';
import { ChangelogDemo } from './changelog-demo';
import { WorkspaceDemo } from './workspace-demo';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    ChangelogDemo,
    WorkspaceDemo,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
