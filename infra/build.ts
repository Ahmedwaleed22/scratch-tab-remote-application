import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';

await mkdir('dev/frontend/ui/licenses', { recursive: true });
await rm('dist', { recursive: true, force: true });
const result = await build({
  metafile: true,
  entryPoints: ['dev/frontend/src/index.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  splitting: true,
  minify: true,
  legalComments: 'inline',
  outdir: 'dist',
  entryNames: 'main',
  // Lazy imports such as Mermaid load as separate chunks, keeping main.js small.
  chunkNames: 'chunks/[name]-[hash]',
  banner: {
    js: '/* Scratch Tab — Preact, Highlight.js, Markdown-it, Mermaid. See ui/licenses/THIRD-PARTY.txt. */',
  },
});
const styles = (await readdir('dev/frontend/ui/style')).filter(name => name.endsWith('.css'));
await build({
  entryPoints: styles.map(name => `dev/frontend/ui/style/${name}`),
  bundle: true,
  minify: true,
  legalComments: 'inline',
  outdir: 'dist/style',
});

// Collect notices for every package that contributes code to the runtime bundle.
const packages = new Set<string>();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  const directory = match?.[1];
  if (directory) packages.add(directory);
}
const notices = await Promise.all(
  [...packages].sort().map(async directory => {
    const files = (await readdir(directory)).filter(name =>
      /^(licen[sc]e|copying|notice)([.-].*)?$/i.test(name),
    );
    if (directory === 'node_modules/fastdom') {
      const readme = await readFile(`${directory}/README.md`, 'utf8');
      return `fastdom\n${readme.slice(readme.lastIndexOf('## License'))}`;
    }
    if (!files.length) throw new Error(`Missing license notice: ${directory}`);
    const texts = await Promise.all(
      files.sort().map(name => readFile(`${directory}/${name}`, 'utf8')),
    );
    return `${directory.replace(/^.*node_modules\//, '')}\n${texts.join('\n')}`;
  }),
);
await writeFile('dev/frontend/ui/licenses/THIRD-PARTY.txt', notices.join('\n\n'));
