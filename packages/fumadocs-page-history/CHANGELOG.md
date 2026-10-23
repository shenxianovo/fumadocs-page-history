# fumadocs-page-history

## 0.4.1

### Patch Changes

- Compare workspace list changes per item so unchanged entries are not repeated. Preserve list numbering and task checkboxes, and keep added and removed content aligned with the surrounding text.

## 0.4.0

### Minor Changes

- 0f2b427: Add opt-in inline document changes in local development. Compare HEAD with the working source, including staged edits, and mark changed words in paragraphs without repeating shared context. Highlight new table rows individually and use block-level fallbacks for complex content. Refresh Git-only changes without restarting the documentation server.

  Keep both revisions of rewritten paragraphs complete, with stronger highlights on changed words. Preserve shared English and Chinese text, highlight link-only destination changes without repeating paragraphs, and retain deleted GFM tables. Include saved interactive examples on the published Demo and separate setup guides from configuration reference documentation.

## 0.3.3

### Patch Changes

- Exclude pure PR merges that retain a page unchanged from any parent, preventing duplicate history entries and contributor credit for merging alone. Keep branch creation, renames, and independent merge edits; filter merges before applying history limits. Share Git combined-diff results across pages during each build.

## 0.3.2

### Patch Changes

- Preserve page creation and relevant merge commits while following renames across branches, without mixing in template copies or unrelated reused paths. Add the build-time `getHistoryPaths` option to combine explicitly mapped migration history in the compiler plugins and standalone reader, with shared SHA deduplication, date ordering, tags, and author resolution.

  Keep the history header's hover and keyboard focus highlight in one compact strip spanning its text and controls, with vertical padding above and below.

## 0.3.1

### Patch Changes

- Show author names beside inline avatars and keep date separators with their dates when long commit messages wrap. Allow multiple inline authors to wrap without overflowing the history panel.

## 0.3.0

### Minor Changes

- Replace flat repository and registry settings with `repository` and explicit `authorMappings`. Support copied content through declarative locations with native path resolution. Explain missing history in development, use the reader's browser time zone after hydration, and reorganize setup, localization, configuration, and troubleshooting documentation.

  This changes the configuration interface: consumers must update repository, account-mapping, and manual UI settings. The public commit URL context is now `repositoryUrl`; time zones are detected automatically.

## 0.2.0

### Minor Changes

- Rename the package and repository to fumadocs-page-history. Update installation instructions, import paths, build-time component injection, and documentation branding to Page History.

## 0.1.1

### Patch Changes

- a261025: Align release tag labels with the surrounding commit text, including wrapped history rows.
  Use horizontal Git commit icons in the page history list.
