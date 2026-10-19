import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';

await build({
  entryPoints: ['infra/syntax-entry.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  legalComments: 'inline',
  outfile: 'ui/scripts/vendor/syntax.js',
  banner: { js: '/* Highlight.js 11.12.0 — BSD-3-Clause. See ui/scripts/vendor/LICENSE.txt. */' },
});
await copyFile('node_modules/highlight.js/LICENSE', 'ui/scripts/vendor/LICENSE.txt');
