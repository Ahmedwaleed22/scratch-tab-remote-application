import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const fixtureRoot = pathToFileURL(process.env.SCRATCH_TAB_TEST_BUILD + '/');
export async function runtimeModule(path) {
  return readFile(
    path === '/main.js'
      ? new URL('../../../../dist/main.js', import.meta.url)
      : new URL(path.slice(1), fixtureRoot),
    'utf8',
  );
}
