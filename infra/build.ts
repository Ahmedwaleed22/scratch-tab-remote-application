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
  minify: true,
  legalComments: 'inline',
  outfile: 'dist/main.js',
  banner: {
    js: '/* Scratch Tab — Preact, Highlight.js, Markdown-it, Mermaid. See ui/licenses/THIRD-PARTY.txt. */',
  },
});

// Collect notices for every package that contributes code to the runtime bundle.
const packages = new Set<string>();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (match) packages.add(match[1]);
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
