import { test } from 'vitest';
import assert from 'node:assert/strict';
import { importFixtureModule } from './support/runtime.js';
const { fileTarget } = await importFixtureModule('links.js');

test('matches current chat workspace links and preserves IDE line reference', () => {
  const target = fileTarget(
    '/api/chats/a/ide-open?path=%2Fworkspace%2Fnote.txt%3A3',
    'https://remote.test',
    'a',
  );
  assert.ok(target);
  assert.equal(target.path, '/workspace/note.txt');
  assert.match(target.ide, /%3A3/);
  assert.equal(target.download, '/api/chats/a/files/download?path=note.txt');
});
