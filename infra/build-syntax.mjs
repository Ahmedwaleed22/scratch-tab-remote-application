import { build } from 'esbuild';
import { copyFile, readFile, writeFile } from 'node:fs/promises';

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

await build({
  entryPoints: ['infra/markdown-entry.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  legalComments: 'inline',
  outfile: 'ui/scripts/vendor/markdown.js',
  banner: {
    js: '/* Markdown-it 15.0.3 and dependencies. See ui/scripts/vendor/LICENSE.markdown.txt. */',
  },
});

const markdownLicenses = [
  ['markdown-it', 'LICENSE'],
  ['argparse', 'LICENSE'],
  ['entities', 'LICENSE'],
  ['linkify-it', 'LICENSE'],
  ['mdurl', 'LICENSE'],
  ['punycode.js', 'LICENSE-MIT.txt'],
  ['uc.micro', 'LICENSE.txt'],
];
const licenseNotices = await Promise.all(
  markdownLicenses.map(async ([name, license]) => {
    const text = await readFile(`node_modules/${name}/${license}`, 'utf8');
    return `${name}\n${text}`;
  }),
);
await writeFile('ui/scripts/vendor/LICENSE.markdown.txt', licenseNotices.join('\n\n'));
