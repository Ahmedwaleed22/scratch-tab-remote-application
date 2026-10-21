import { test } from 'vitest';
import assert from 'node:assert/strict';
import { importFixtureModule } from './support/runtime.js';
const { fileTarget } = await importFixtureModule('links.js');

test('supports legacy Code Server payloads and current-project host paths', () => {
  const origin = 'https://remote.test';
  const cwd = '/var/lib/remote/projects/alpha/workspace/docs';
  const url = new URL('https://code.remote.test/alpha/');
  url.searchParams.set(
    'payload',
    JSON.stringify([['openFile', 'vscode-remote://code.remote.test/workspace/a%20b.txt:4:2']]),
  );
  assert.equal(fileTarget(url.href, origin, 'a', cwd)?.path, '/workspace/a b.txt');
  assert.equal(
    fileTarget(
      '/api/chats/a/ide-open?path=/var/lib/remote/projects/alpha/workspace/README.md',
      origin,
      'a',
      cwd,
    )?.path,
    '/workspace/README.md',
  );
  assert.equal(
    fileTarget(
      '/api/chats/a/ide-open?path=/var/lib/remote/projects/beta/workspace/README.md',
      origin,
      'a',
      cwd,
    ),
    null,
  );
  url.searchParams.set('payload', '{bad');
  assert.equal(fileTarget(url.href, origin, 'a', cwd), null);
});
