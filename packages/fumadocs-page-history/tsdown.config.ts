import { mkdir, writeFile } from 'node:fs/promises';
import { compile, typegen } from 'fuma-translate';
import { defineConfig } from 'tsdown';

export default defineConfig({
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  entry: [
    './src/index.ts',
    './src/git/index.ts',
    './src/workspace/index.ts',
    './src/ui/index.ts',
    './src/i18n/index.ts',
    './src/remark.ts',
    './src/satteri.ts',
    './src/schema.ts',
  ],
  unbundle: true,
  ignoreWatch: ['src/.translations/**'],
  plugins: [
    {
      name: 'generate-translations',
      buildStart: {
        order: 'pre',
        async handler() {
          const output = await compile({ input: ['src/**/*.ts', 'src/**/*.tsx'] });
          await mkdir('src/.translations', { recursive: true });
          await writeFile('src/.translations/index.ts', typegen(output));
          await writeFile('src/.translations/keys.json', JSON.stringify(output.translationKeys));
        },
      },
    },
  ],
  dts: { sourcemap: false },
  sourcemap: false,
  deps: { neverBundle: [/^node:/] },
});
