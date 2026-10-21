import { inject } from 'vitest';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const fixtureRoot = pathToFileURL(inject('fixtureDirectory') + '/');
export async function runtimeModule(path) {
  return readFile(
    path === '/main.js'
      ? new URL('production.js', fixtureRoot)
      : new URL(path.slice(1), fixtureRoot),
    'utf8',
  );
}

export async function installBrowserImports(page) {
  // Keep browser imports outside Vite's server-side module transformation.
  await page.addInitScript('window.importModule = path => import(path)');
}
