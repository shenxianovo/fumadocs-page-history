import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Check the actual documentation build, including the collection's MDX preset.
const html = (await readFile('.next/server/app/docs.html', 'utf8')).replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/g,
  '',
);
assert.ok(!html.includes('[toc]'), 'TOC-only headings must not appear in the page body');
for (const id of ['git-contributors', 'git-history']) {
  assert.equal(html.match(new RegExp(`id="${id}"`, 'g'))?.length, 1, `${id} must appear once`);
  assert.ok(html.includes(`href="#${id}"`), `${id} must have a navigation link`);
}
console.log('Built documentation footer checks passed.');

const routes = JSON.parse(await readFile('.next/routes-manifest.json', 'utf8'));
assert.ok(
  routes.redirects.some(
    (route) => route.source === '/' && route.destination === '/docs' && route.statusCode === 308,
  ),
  'The root URL must redirect permanently to the documentation',
);
const demo = await readFile('.next/server/app/docs/demo.html', 'utf8');
assert.ok(demo.includes('Page History'), 'The Story preview must render');
assert.ok(demo.includes('demo-history'), 'The Story preview must include the history component');
assert.ok(demo.includes('Preview options'), 'The Story controls must render');
assert.ok(!demo.includes('>Props<'), 'The preview must not repeat the controls heading');
assert.ok(!demo.includes('No generated data for story'), 'Story must receive compiled controls');
console.log('Built Story demo and root redirect checks passed.');
assert.ok(demo.includes('Inline changes demo'), 'The published inline changes demo must render');
assert.ok(
  demo.includes('data-workspace-example="expanded-paragraph"'),
  'The default inline example must render in production',
);
assert.ok(
  demo.includes('data-change="added"') && demo.includes('data-change="removed"'),
  'The published demo must show both change colors',
);
console.log('Built inline changes demo checks passed.');
