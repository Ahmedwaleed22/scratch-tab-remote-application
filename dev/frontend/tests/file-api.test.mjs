import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureRoot } from './support/runtime.mjs';

test('file API validates read and save responses and preserves request shapes', async () => {
  const { createFiles } = await import(new URL('api/files.js', fixtureRoot));
  let result = { content: 'text', revision: 'original' };
  const calls = [];
  const files = createFiles(
    {
      async call(path, options) {
        calls.push({ path, ...options });
        return result;
      },
    },
    'project',
  );
  assert.deepEqual(await files.read('/workspace/note.txt'), result);
  result = { revision: 'saved' };
  assert.deepEqual(await files.save('/workspace/note.txt', 'edited', 'original'), result);
  assert.deepEqual(calls, [
    { path: 'file', projectId: 'project', method: 'POST', body: { path: '/workspace/note.txt' } },
    {
      path: 'file',
      projectId: 'project',
      method: 'POST',
      body: { path: '/workspace/note.txt', content: 'edited', revision: 'original', save: true },
    },
  ]);
  for (const invalid of [
    null,
    [],
    {},
    { content: 42, revision: 'r' },
    { content: 'text', revision: 42 },
  ]) {
    result = invalid;
    await assert.rejects(files.read('/workspace/note.txt'), /Unexpected file response/);
  }
  for (const invalid of [null, [], {}, { revision: 42 }]) {
    result = invalid;
    await assert.rejects(
      files.save('/workspace/note.txt', 'text', 'r'),
      /Unexpected save response/,
    );
  }
});
