import { test } from 'vitest';
import assert from 'node:assert/strict';
import { importFixtureModule } from './support/runtime.js';
const { fileTarget } = await importFixtureModule('links.js');

test('does not intercept Code Server links for other projects or domains', () => {
  const cwd = '/var/lib/remote/projects/alpha/workspace';
  for (const href of [
    'https://code--beta.remote.test/_static/remote-open.html?file=/workspace/README.md',
    'https://code--alpha.evil.test/_static/remote-open.html?file=/workspace/README.md',
  ]) {
    assert.equal(fileTarget(href, 'https://remote.test', 'a', cwd), null);
  }
});
