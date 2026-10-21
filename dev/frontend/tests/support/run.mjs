import { build } from 'esbuild';
import { mkdtemp, readdir, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const frontend = new URL('../../', import.meta.url);
const root = new URL('../../', frontend);
const temporary = new URL('.test-build/', frontend);
await mkdir(temporary, { recursive: true });
const fixture = await mkdtemp(fileURLToPath(temporary) + 'run-');
try {
  const sourceFiles = await readdir(new URL('src/', frontend), { recursive: true });
  await build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: sourceFiles
      .filter(name => /\.tsx?$/.test(name) && name !== 'types.ts')
      .map(name => 'dev/frontend/src/' + name),
    outbase: 'dev/frontend/src',
    outdir: fixture,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    chunkNames: 'chunks/[name]-[hash]',
  });
  const tests = (await readdir(new URL('tests/', frontend)))
    .filter(name => name.endsWith('.test.mjs'))
    .sort()
    .map(name => fileURLToPath(new URL('tests/' + name, frontend)));
  const child = spawn(
    process.execPath,
    ['--test', '--test-concurrency=1', ...process.argv.slice(2), ...tests],
    {
      stdio: 'inherit',
      env: { ...process.env, SCRATCH_TAB_TEST_BUILD: fixture },
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  await rm(fixture, { recursive: true, force: true });
}
