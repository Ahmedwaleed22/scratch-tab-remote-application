import type { TestProject } from 'vitest/node';
import { build } from 'esbuild';
import { mkdtemp, readdir, rm, mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const frontend = new URL('../../', import.meta.url);
  const root = new URL('../../', frontend);
  const temporary = new URL('.test-build/', frontend);
  await mkdir(temporary, { recursive: true });
  const fixture = await mkdtemp(fileURLToPath(temporary) + 'run-');
  async function compile(): Promise<void> {
    await execute('npm', ['run', 'build'], { cwd: fileURLToPath(root) });
    await copyFile(new URL('dist/main.js', root), fixture + '/production.js');
    await cp(new URL('dist/chunks/', root), fixture + '/chunks/', { recursive: true });
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
  }
  try {
    await compile();
    project.provide('fixtureDirectory', fixture);
    project.onTestsRerun(async () => {
      await compile();
      for (const name of await readdir(fixture, { recursive: true })) {
        if (name.endsWith('.js')) project.vitest.invalidateFile(fixture + '/' + name);
      }
    });
  } catch (error) {
    await rm(fixture, { recursive: true, force: true });
    throw error;
  }
  return () => rm(fixture, { recursive: true, force: true });
}
