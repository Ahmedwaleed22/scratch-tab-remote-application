import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runtimeModule } from './support/runtime.mjs';

test('updater shares installation ownership across popups and releases it after cancellation', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({ contentType: 'text/javascript', body: await runtimeModule(path) });
      return route.fulfill({
        contentType: 'text/html',
        body: '<div id="first"></div><div id="second"></div>',
      });
    });
    await page.goto('https://remote.test/');
    await page.evaluate(async () => {
      const { mountUpdates } = await import('/app/updates.js');
      window.downloads = 0;
      window.uploads = 0;
      window.reloads = 0;
      const remote = {
        application: { version: '1.0.0' },
        backend: {
          async call() {
            return { version: '1.1.0' };
          },
          async fetch(_path, options) {
            window.downloads++;
            if (window.downloads === 1) {
              window.firstSignal = options.signal;
              return new Promise(resolve => {
                window.finishDownload = () => resolve(new Response('verified zip'));
              });
            }
            return new Response('verified zip');
          },
        },
      };
      window.fetch = async (_url, options = {}) => {
        if (options.method === 'POST') {
          window.uploads++;
          return new Response(
            JSON.stringify({ id: 'scratch-tab', version: '1.1.0', upgraded: [] }),
          );
        }
        return new Response(JSON.stringify([{ id: 'scratch-tab', version: '1.0.0' }]));
      };
      const options = {
        remote,
        projectId: 'p1',
        drafts: new Map(),
        reload: () => window.reloads++,
      };
      window.closeFirst = mountUpdates(document.querySelector('#first'), options);
      window.closeSecond = mountUpdates(document.querySelector('#second'), options);
    });
    let confirmations = 0;
    page.on('dialog', async dialog => {
      confirmations++;
      await dialog.accept();
    });
    const first = page.locator('#first');
    const second = page.locator('#second');
    await first.getByText('Version 1.1.0 is available', { exact: false }).waitFor();
    await second.getByText('Version 1.1.0 is available', { exact: false }).waitFor();
    await first.getByRole('button', { name: 'Update', exact: true }).click();
    await page.waitForFunction(() => typeof window.finishDownload === 'function');
    await page.evaluate(() => window.closeFirst());
    assert.equal(await page.evaluate(() => window.firstSignal.aborted), true);
    await second.getByRole('button', { name: 'Update', exact: true }).click();
    assert.equal(confirmations, 1);
    assert.equal(await page.evaluate(() => window.downloads), 1);
    await page.evaluate(async () => {
      window.finishDownload();
      // Let the cancelled request unwind through beforeUpload and release the lock.
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(await page.evaluate(() => window.uploads), 0);
    await second.getByRole('button', { name: 'Update', exact: true }).click();
    await page.waitForFunction(() => window.reloads === 1);
    assert.equal(confirmations, 2);
    assert.equal(await page.evaluate(() => window.downloads), 2);
    assert.equal(await page.evaluate(() => window.uploads), 1);
    await page.evaluate(() => window.closeSecond());
    assert.equal(await page.locator('.scratch-tab-updates').count(), 0);
  } finally {
    await browser.close();
  }
});
