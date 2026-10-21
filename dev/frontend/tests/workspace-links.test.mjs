import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fixtureRoot } from './support/runtime.mjs';
const { fileTarget } = await import(new URL('links.js', fixtureRoot));

test('matches current chat workspace links and preserves IDE line reference', () => {
  const target = fileTarget(
    '/api/chats/a/ide-open?path=%2Fworkspace%2Fnote.txt%3A3',
    'https://remote.test',
    'a',
  );
  assert.equal(target.path, '/workspace/note.txt');
  assert.match(target.ide, /%3A3/);
  assert.equal(target.download, '/api/chats/a/files/download?path=note.txt');
});
