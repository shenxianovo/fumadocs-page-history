# Visual regression checks

## Inline working changes

Run the local docs server and open `/docs/configuration` in development mode.
The compiler option `workspaceChanges: true` and `/api/page-changes` are enabled
in this workspace. No inline markers should appear in a production build.

1. Replace a phrase in the opening paragraph. Shared words and the existing link
   must appear once; only deleted and added phrases get red and green backgrounds,
   and deleted phrases are also struck through.
   There must be no outline, line numbers, popup, or separate comparison page.
2. Add one row to the first table. Only that row gets a green background; the
   header and existing rows retain their normal backgrounds.
3. Add or delete a complete paragraph or code block. Deleted content remains at
   its original position, including deletion at the end of the document. Added
   blocks have a solid green edge bar and deleted blocks a dashed red one; the
   block text stays aligned with surrounding paragraphs, and the tinted area must
   not cause horizontal scrolling at 390px.
4. Stage an edit, then edit the same paragraph again. The display must compare
   HEAD with the working file, including both changes. Commit or revert it and
   verify that markers clear within three seconds without restarting the server.
5. Check at 390px and 1200px, in both themes. Existing headings, links, code,
   table overflow, history, and table-of-contents navigation must still work.
6. During a source rebuild, the page must not decorate old text with a new diff.
   A pending notice may appear until the source digest matches. Missing routes
   and merge conflicts must show a notice, with the normal document preserved.

Paragraph regression: whole-block replacement used to repeat the common prefix
in both a red and a green paragraph. Verify that the opening phrase occurs once.
Repeat after expanding the replacement suffix until the paragraph is much longer;
the shared prefix must still appear once instead of falling back to whole blocks.
Link regression: change only a Markdown link destination. The full paragraph
must appear once, the current link must keep its destination, and only its label
gets highlighted. Hovering the highlight must show both source targets.
Automatic refresh: no manual refresh button should appear. Git-only updates and
recovery from a failed comparison must continue automatically.
Chinese regression: changing a word such as 程序 to 进程 must highlight complete
words. A largely unrelated replacement paragraph must keep both full paragraphs
rather than splicing them around isolated shared characters. Confirm that both
the old and current text can be recovered without dropped or duplicated text.
Table regression: inserting a row used to highlight the entire table.
Deleted table regressions: replace an entire table and verify that the red old
table retains its headers and cells rather than showing Markdown pipes. Its
outer edges must align with the new table at 390px and 1200px; deletion styling
must not add padding around the old table, and its body rows must retain the red
background in both themes.

## History layout

The UI tests render server HTML without a browser layout engine. Use the docs demo
to check CSS alignment changes:

1. Run `pnpm docs-dev` and open `http://127.0.0.1:3013/docs/demo`.
2. Choose the Expanded example, keep Page history enabled, and enable Inline authors.
3. At a viewport width of 1200px, check that the release label shares the commit
   text's baseline and its icon is visually centered beside the label. Check the
   icon's visible strokes, not only its SVG bounding box: the tag outline carries
   more weight in its upper half and needs a small downward optical adjustment.
4. Repeat at 390px, where the message wraps and the commit icon is hidden. The
   commit hash must stay visible, since it is the entry's only commit link. The
   release label should stay aligned with its line without horizontal overflow.
5. At 1200px, the horizontal commit icon should align with the first line
   of each entry and keep its circular node round.
6. Inline authors must show both the avatar and readable name, including fallback
   avatars and multiple co-authors. The separator and date must stay on one line;
   they may move together to the next line after a long subject. Switch Relative
   dates off and Language to Chinese to check both date formats.
7. Cover representative combinations: default collapsed history, expanded history
   with inline authors, compact history without contributors or headings,
   contributors only, empty history, and both sections disabled. Test relative
   and absolute dates in English and Chinese, and the Co-authors example with its
   longer name and fallback avatar. At 1200px and 390px, check section visibility,
   translated labels, initial expansion, author names, date wrapping, and overflow.
   Changing an option preserves direct interactions except Start expanded, which
   starts a new preview.
8. After sorting or directly collapsing the history, Reset must restore the
   selected example's initial expansion and newest-first order. All seven examples
   must restore their documented options.
9. Hover the latest-edit text, the View full history label, and the space between
   them. The toggle shows one continuous ghost-button highlight; the sort button
   has its own matching highlight. While collapsed, no sort button is shown, and
   the label reads View full history; once expanded, it reads Collapse history and
   the sort button appears after the toggle. Tab focus rings the toggle and the
   sort button separately.
10. Reload a page with Relative dates enabled and a throttled CPU. Relative dates
    must not flash a UTC date before hydration, and their space stays reserved so
    the row does not jump. Commit rows older than a week show the absolute date.
11. Below a normal document, Contributors and Page history must read as compact
    page metadata: tighter spacing and no divider between the two sections,
    with headings retaining their 1.5rem size and 650 weight.

Regression: the release label used to sit above the surrounding text because an
inline flex container with an SVG first child supplied the label's baseline.
Check the label's text alignment, not just the icon's position. Browser text-range
measurements should differ in vertical center by no more than 1 CSS pixel on the
same line (account for whole line-height increments when the label wraps).
