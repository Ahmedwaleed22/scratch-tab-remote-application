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

test('recognizes Code Server app links in the active project', () => {
  const origin = 'https://remote.test';
  const cwd = '/var/lib/remote/projects/alpha/workspace';
  const href =
    'https://code--alpha.remote.test/_static/remote-open.html?folder=%2Fworkspace&file=%2Fworkspace%2FREADME.md&line=3';
  const target = fileTarget(href, origin, 'a', cwd);
  assert.equal(target?.path, '/workspace/README.md');
  assert.equal(target?.ide, href);
});

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

test('does not intercept Code Server links for other projects or domains', () => {
  const cwd = '/var/lib/remote/projects/alpha/workspace';
  for (const href of [
    'https://code--beta.remote.test/_static/remote-open.html?file=/workspace/README.md',
    'https://code--alpha.evil.test/_static/remote-open.html?file=/workspace/README.md',
  ]) {
    assert.equal(fileTarget(href, 'https://remote.test', 'a', cwd), null);
  }
});

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
