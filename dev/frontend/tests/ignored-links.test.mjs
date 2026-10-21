import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureRoot } from './support/runtime.mjs';
const { fileTarget } = await import(new URL('links.js', fixtureRoot));

test('ignores external, other chat, media, traversal and host links', () => {
  for (const href of [
    'https://other.test/api/chats/a/ide-open?path=/workspace/a',
    '/api/chats/b/ide-open?path=/workspace/a',
    '/api/chats/a/media-open?path=/workspace/a.png',
    '/api/chats/a/ide-open?path=/workspace/../etc/passwd',
    '/api/chats/a/ide-open?path=/etc/passwd',
  ])
    assert.equal(fileTarget(href, 'https://remote.test', 'a'), null);
});
