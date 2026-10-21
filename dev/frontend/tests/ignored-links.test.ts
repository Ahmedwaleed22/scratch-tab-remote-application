import { test } from 'vitest';
import assert from 'node:assert/strict';
import { importFixtureModule } from './support/runtime.js';
const { fileTarget } = await importFixtureModule('links.js');

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
