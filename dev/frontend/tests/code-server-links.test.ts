import { test } from 'vitest';
import assert from 'node:assert/strict';
import { importFixtureModule } from './support/runtime.js';
const { fileTarget } = await importFixtureModule('links.js');

test('recognizes Code Server app links in the active project', () => {
  const origin = 'https://remote.test';
  const cwd = '/var/lib/remote/projects/alpha/workspace';
  const href =
    'https://code--alpha.remote.test/_static/remote-open.html?folder=%2Fworkspace&file=%2Fworkspace%2FREADME.md&line=3';
  const target = fileTarget(href, origin, 'a', cwd);
  assert.equal(target?.path, '/workspace/README.md');
  assert.equal(target?.ide, href);
});
