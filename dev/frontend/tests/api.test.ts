import { test } from 'vitest';
import assert from 'node:assert/strict';
import { backendFixture, importFixtureModule } from './support/runtime.js';

test('file API validates read and save responses and preserves request shapes', async () => {
  const { createFiles } = await importFixtureModule('api/files.js');
  let result: unknown = { content: 'text', revision: 'original' };
  const calls: (import('../src/types.js').BackendOptions & { path: string })[] = [];
  const files = createFiles(
    backendFixture({
      async call(path, options) {
        calls.push({ path, ...options });
        return result;
      },
    }),
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
  calls.length = 0;
  await files.save('/workspace/note.txt', 'back', 'original', true);
  assert.deepEqual(calls[0]?.body, {
    path: '/workspace/note.txt',
    content: 'back',
    revision: 'original',
    save: true,
    create: true,
  });
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

test('directory API lists Remote workspace folders and reports its errors', async () => {
  const { createDirectories } = await importFixtureModule('api/directories.js');
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let response = (): Response =>
    Response.json({
      path: 'src',
      entries: [
        { name: 'app.ts', path: 'src/app.ts', isDir: false, size: 3 },
        { name: 'lib', path: 'src/lib', isDir: true },
        { name: 42, path: 'src/bad', isDir: false },
      ],
      truncated: false,
    });
  globalThis.fetch = async input => {
    requests.push(String(input));
    return response();
  };
  try {
    const directories = createDirectories();
    assert.deepEqual(await directories.list('chat 1', 'src'), [
      { name: 'app.ts', path: 'src/app.ts', isDir: false },
      { name: 'lib', path: 'src/lib', isDir: true },
    ]);
    await directories.list('chat 1', '');
    assert.deepEqual(requests, ['/api/chats/chat%201/files?path=src', '/api/chats/chat%201/files']);
    response = () => Response.json({ error: 'folder not found' }, { status: 404 });
    await assert.rejects(directories.list('chat', 'gone'), /^Error: folder not found$/);
    response = () => new Response('<html>', { status: 502 });
    await assert.rejects(directories.list('chat', ''), /Cannot list folder \(502\)/);
    response = () => Response.json({ entries: null });
    await assert.rejects(directories.list('chat', ''), /Unexpected folder response/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('updater API validates unknown JSON and accepts packages without a version', async () => {
  const { createUpdates } = await importFixtureModule('api/updates.js');
  const originalFetch = globalThis.fetch;
  let latest: unknown = { version: '0.6.4' };
  let packages: unknown = [{ id: 'scratch-tab', version: '0.6.4' }, { id: 'unversioned' }];
  let uploaded: unknown = {
    id: 'scratch-tab',
    version: '0.6.4',
    upgraded: [{ error: 'Upgrade failed' }],
  };
  let archive = new Response('zip');
  let beforeUploads = 0;
  const api = createUpdates(
    backendFixture({
      async call() {
        return latest;
      },
      async fetch() {
        return archive;
      },
    }),
    'project',
    new AbortController().signal,
  );
  globalThis.fetch = async (_url, options = {}) =>
    Response.json(options.method === 'POST' ? uploaded : packages);
  try {
    assert.deepEqual(await api.latest(), latest);
    assert.deepEqual(await api.packages(), packages);
    assert.deepEqual(await api.install('0.6.4', () => beforeUploads++), uploaded);
    assert.equal(beforeUploads, 1);
    for (const invalid of [null, {}, { version: 42 }]) {
      latest = invalid;
      await assert.rejects(api.latest(), /Unexpected release response/);
    }
    for (const invalid of [
      null,
      {},
      [null],
      [{ id: 'app', version: 42 }],
      [{ id: 'app', upgraded: [{ error: 42 }] }],
    ]) {
      packages = invalid;
      await assert.rejects(api.packages(), /Unexpected package list response/);
    }
    uploaded = { id: 42 };
    archive = new Response('zip');
    await assert.rejects(
      api.install('0.6.4', () => {}),
      /Unexpected package response/,
    );
    archive = Response.json({ error: 'Checksum mismatch' }, { status: 502 });
    await assert.rejects(
      api.install('0.6.4', () => {}),
      /Checksum mismatch/,
    );
    archive = Response.json({ error: { message: 'bad' } }, { status: 502 });
    await assert.rejects(
      api.install('0.6.4', () => {}),
      /Could not download the verified release ZIP/,
    );
    for (const body of ['<html>Bad gateway</html>', 'Bad gateway', '{bad', '']) {
      archive = new Response(body, { status: 502 });
      await assert.rejects(
        api.install('0.6.4', () => beforeUploads++),
        {
          message: 'Could not download the verified release ZIP.',
        },
      );
    }
    assert.equal(beforeUploads, 1, 'failed downloads never start an upload');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
