import type { Remote } from '../../src/types.js';
import type { RemoteFixture, FixtureModules } from './browser.js';
import type { Page } from 'playwright';
import { inject } from 'vitest';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const fixtureRoot = pathToFileURL(inject('fixtureDirectory') + '/');
export async function runtimeModule(path: string): Promise<string> {
  return readFile(
    path === '/main.js'
      ? new URL('production.js', fixtureRoot)
      : new URL(path.slice(1), fixtureRoot),
    'utf8',
  );
}

export async function installBrowserImports(page: Page): Promise<void> {
  // Keep browser imports outside Vite's server-side module transformation.
  await page.addInitScript('window.importModule = path => import(path)');
  await page.addInitScript(() => {
    // Remote is supplied by the host; fixtures implement only the exercised capabilities.
    window.createRemote = fixture => fixture as Remote;
  });
}

declare module 'vitest' {
  export interface ProvidedContext {
    fixtureDirectory: string;
  }
}

export async function importFixtureModule<K extends keyof FixtureModules>(
  path: K,
): Promise<FixtureModules[K]> {
  return import(new URL(path, fixtureRoot).href);
}

export function backendFixture(fixture: NonNullable<RemoteFixture['backend']>): Remote['backend'] {
  // A test double returns controlled unknown JSON at the host transport boundary.
  return fixture as Remote['backend'];
}
