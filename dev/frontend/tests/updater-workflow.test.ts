import { test } from 'vitest';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.js';

test('GitHub updater checks versions, protects drafts, uploads, and reports partial failures', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({
          contentType: 'text/javascript',
          body: await runtimeModule(path),
        });
      return route.fulfill({ contentType: 'text/html', body: '<div id="updates"></div>' });
    });
    await page.goto('https://remote.test/');
    await page.evaluate(async () => {
      const { mountUpdates } = await window.importModule('/app/updates.js');
      const { isNewer } = await window.importModule('/services/releaseVersion.js');
      window.comparisons = [
        isNewer('0.10.0', '0.9.0'),
        isNewer('0.3.2', '0.4.0'),
        isNewer('0.4.0-beta', '0.3.2'),
        isNewer('0.4.0', '0.4.0'),
      ];
      window.uploads = 0;
      window.reloads = 0;
      window.drafts = new Map();
      window.partial = false;
      window.denied = false;
      window.badDownload = false;
      const remote: RemoteTestFixture = {
        application: { version: '0.3.2' },
        backend: {
          async call() {
            return { version: '0.4.0' };
          },
          async fetch() {
            if (window.draftDuringDownload)
              window.drafts.set('new', {
                content: 'new edit',
                revision: '',
                baseline: '',
                crlf: false,
              });
            return window.badDownload
              ? new Response(JSON.stringify({ error: 'Checksum mismatch' }), { status: 502 })
              : new Response('verified zip', { headers: { 'Content-Type': 'application/zip' } });
          },
        },
      };
      window.fetch = async (url, options = {}) => {
        if (window.denied) return new Response('{}', { status: 403 });
        if (options.method === 'POST') {
          window.uploads++;
          if (!(options.body instanceof FormData)) throw new Error('Expected upload FormData');
          const zip = options.body.get('package');
          if (!(zip instanceof File)) throw new Error('Expected package file');
          window.archiveName = zip.name;
          return new Response(
            JSON.stringify({
              id: 'scratch-tab',
              version: '0.4.0',
              upgraded: window.partial ? [{ error: 'container unavailable' }] : [],
            }),
          );
        }
        return new Response(JSON.stringify([{ id: 'scratch-tab', version: '0.3.2' }]));
      };
      window.remount = () => {
        window.cleanup?.();
        window.cleanup = mountUpdates(document.querySelector<HTMLElement>('#updates')!, {
          remote: window.createRemote(remote),
          projectId: 'p1',
          drafts: window.drafts,
          reload: () => window.reloads++,
        });
      };
      window.remount();
    });
    assert.deepEqual(await page.evaluate(() => window.comparisons), [true, false, false, false]);
    await page.getByText('Version 0.4.0 is available', { exact: false }).waitFor();
    await page.evaluate(() =>
      window.drafts.set('a', { content: 'unsaved', revision: '', baseline: '', crlf: false }),
    );
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page
      .getByText('Save or discard all Scratch Tab drafts in this tab before updating.', {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.evaluate(() => window.uploads), 0);
    await page.evaluate(() => {
      window.drafts.clear();
      window.badDownload = true;
    });
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page.getByText('Checksum mismatch', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.reloads), 0);
    await page.evaluate(() => {
      window.badDownload = false;
      window.draftDuringDownload = true;
    });
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page
      .getByText('A Scratch Tab draft was created during download. Save it before updating.', {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.evaluate(() => window.uploads), 0);
    await page.evaluate(() => {
      window.draftDuringDownload = false;
      window.drafts.clear();
      window.partial = true;
    });
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page
      .getByText('Package updated, but 1 project upgrade(s) failed.', { exact: false })
      .waitFor();
    assert.equal(await page.evaluate(() => window.reloads), 0);
    assert.equal(await page.evaluate(() => window.archiveName), 'scratch-tab-0.4.0.zip');
    await page.evaluate(() => {
      window.partial = false;
      window.remount();
    });
    await page.getByText('Version 0.4.0 is available', { exact: false }).waitFor();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page.waitForFunction(() => window.reloads === 1);
    await page.evaluate(() => {
      window.denied = true;
      window.remount();
    });
    await page.getByText('Only administrators can update Scratch Tab.', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Update', exact: true }).isVisible(),
      false,
    );
    await page.evaluate(() => window.cleanup());
    assert.equal(await page.locator('.scratch-tab-updates').count(), 0);
  } finally {
    await browser.close();
  }
});
