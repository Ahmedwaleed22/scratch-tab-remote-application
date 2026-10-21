import { test } from 'vitest';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.mjs';

test('updater belongs only to Scratch Tab card and closes with its owner', async () => {
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
      return route.fulfill({
        contentType: 'text/html',
        body: '<div id="card"></div><div id="other"></div>',
      });
    });
    await page.goto('https://remote.test/');
    await page.evaluate(async () => {
      const { default: activate } = await window.importModule('/main.js');
      window.slots = [];
      window.projects = [];
      window.fetch = async () =>
        new Response(JSON.stringify([{ id: 'scratch-tab', version: '0.4.1' }]));
      activate({
        application: { id: 'scratch-tab', version: '0.4.1' },
        slots: {
          applicationCardActions: 'card',
          chatHeaderActions: 'chat',
          sidebarHeaderActions: 'sidebar',
        },
        backend: {
          async call(path, options) {
            window.projects.push(options.projectId);
            return { version: '0.4.2' };
          },
        },
        ui: {
          register(slot, render, options) {
            window.slots.push(slot);
            if (slot !== 'card') return;
            for (const [id, app] of [
              ['card', 'scratch-tab'],
              ['other', 'redis'],
            ]) {
              const context = { projectId: 'p1', instance: { applicationId: app } };
              if (options.when(context))
                window.cardCleanup = render(document.getElementById(id), context);
            }
          },
          openPopup(options) {
            const body = document.createElement('div');
            body.id = 'popup';
            document.body.append(body);
            const cleanup = options.mount(body);
            return {
              close() {
                cleanup?.();
                body.remove();
              },
            };
          },
        },
      });
    });
    assert.deepEqual(await page.evaluate(() => window.slots), ['card', 'sidebar', 'chat']);
    assert.equal(await page.locator('#other button').count(), 0);
    await page.getByRole('button', { name: 'Updates', exact: true }).click();
    await page.getByText('Version 0.4.2 is available', { exact: false }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.projects), ['p1']);
    assert.equal(await page.getByRole('button', { name: 'Update', exact: true }).isVisible(), true);
    await page.evaluate(() => window.cardCleanup());
    assert.equal(await page.locator('#popup').count(), 0);
    assert.equal(await page.locator('#card button').count(), 0);
  } finally {
    await browser.close();
  }
});
