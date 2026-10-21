import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fixtureRoot } from './support/runtime.mjs';

test('updater API validates unknown JSON and accepts packages without a version', async () => {
  const { createUpdates } = await import(new URL('api/updates.js', fixtureRoot));
  const originalFetch = globalThis.fetch;
  let latest = { version: '0.6.4' };
  let packages = [{ id: 'scratch-tab', version: '0.6.4' }, { id: 'unversioned' }];
  let uploaded = { id: 'scratch-tab', version: '0.6.4', upgraded: [{ error: 'Upgrade failed' }] };
  let archive = new Response('zip');
  let beforeUploads = 0;
  const api = createUpdates(
    {
      async call() {
        return latest;
      },
      async fetch() {
        return archive;
      },
    },
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
