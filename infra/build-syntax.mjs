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

// The tiny distribution is an IIFE; expose its local API as an ES module without globals.
const tiny = await readFile('node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js', 'utf8');
const globalExport =
  'globalThis["mermaid"] = globalThis.__esbuild_esm_mermaid_nm["mermaid"].default;';
if (!tiny.includes(globalExport)) throw new Error('Unexpected Mermaid tiny export');
await writeFile(
  'ui/scripts/vendor/mermaid.js',
  tiny.replace(globalExport, 'export default __esbuild_esm_mermaid_nm.mermaid.default;'),
);
await copyFile('node_modules/@mermaid-js/tiny/LICENSE', 'ui/scripts/vendor/LICENSE.mermaid.txt');
