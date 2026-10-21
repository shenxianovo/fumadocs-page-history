'use client';

import { useId, useState, type ReactNode } from 'react';
import { GitPageChangesView } from 'fumadocs-page-history/ui';
import type { InlinePageChanges, SourceRange } from 'fumadocs-page-history';

export interface WorkspaceExample {
  id: string;
  label: string;
  description: string;
  changes: InlinePageChanges;
  ranges: SourceRange[];
  body: ReactNode;
}

export function WorkspacePreview({ examples }: { examples: WorkspaceExample[] }) {
  const [selected, setSelected] = useState(examples[0].id);
  const id = useId();
  const example = examples.find((entry) => entry.id === selected) ?? examples[0];
  return (
    <section aria-label="Inline changes demo" className="overflow-hidden rounded-xl border">
      <div className="not-prose space-y-2 border-b bg-fd-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={id} className="text-sm font-medium">
            Change example
          </label>
          <select
            id={id}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="min-w-0 rounded-md border bg-fd-background px-2 py-1 text-sm"
          >
            {examples.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-fd-muted-foreground">{example.description}</p>
        <div className="flex gap-4 text-xs" aria-label="Change colors">
          <span className="text-green-700 dark:text-green-400">Green: added</span>
          <span className="text-red-700 dark:text-red-400">Red: removed</span>
        </div>
      </div>
      <div className="bg-fd-background px-4 py-1" data-workspace-example={example.id}>
        <GitPageChangesView key={example.id} changes={example.changes} ranges={example.ranges}>
          {example.body}
        </GitPageChangesView>
      </div>
    </section>
  );
}
