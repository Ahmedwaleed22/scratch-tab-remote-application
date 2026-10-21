import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule } from './support/runtime.mjs';

test('file tabs retain independent edits, detach into windows, and protect dirty closes', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({
          contentType: 'text/javascript',
          body: await runtimeModule(path),
        });
      return route.fulfill({
        contentType: 'text/html',
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><a href="/api/chats/a/ide-open?path=/workspace/one.txt">First file</a><a href="/api/chats/a/ide-open?path=/workspace/two.txt">Second file</a><a href="/api/chats/a/ide-open?path=/workspace/three.txt">Third file</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      const { mountChat } = await import('/app/chat.js');
      window.disk = {
        '/workspace/one.txt': 'first',
        '/workspace/two.txt': 'second',
        '/workspace/three.txt': 'third',
      };
      window.reads = 0;
      window.drafts = new Map();
      window.cleanup = mountChat({
        context: { chatId: 'a', projectId: 'p1' },
        drafts: window.drafts,
        launchIde: () => {},
        files: {
          async read(path) {
            window.reads++;
            return { content: window.disk[path], revision: 'initial' };
          },
          async save(path, content) {
            window.disk[path] = content;
            return { revision: 'saved' };
          },
        },
      });
    });
    const open = async name => {
      await page.getByRole('link', { name }).click({ force: true });
    };
    const visible = page.locator('.scratch-tab-window:visible');
    await open('First file');
    await visible.locator('textarea').fill('first draft');
    await visible.evaluate(node => {
      node.style.left = '120px';
      node.style.width = '700px';
    });
    await open('Second file');
    assert.equal(await visible.evaluate(node => node.style.left), '120px');
    assert.equal(await visible.evaluate(node => node.style.width), '700px');
    assert.equal(await visible.count(), 1);
    assert.equal(await visible.getByRole('tab').count(), 2);
    assert.equal(await visible.locator('textarea').inputValue(), 'second');
    await visible.locator('textarea').fill('second draft');
    await visible.getByRole('tab', { name: 'one.txt', exact: false }).click();
    assert.equal(await visible.locator('textarea').inputValue(), 'first draft');
    await visible.getByRole('tab', { name: 'one.txt', exact: false }).press('ArrowRight');
    assert.equal(await visible.locator('textarea').inputValue(), 'second draft');
    assert.equal(
      await visible
        .getByRole('tab', { selected: true })
        .evaluate(node => node === document.activeElement),
      true,
    );
    await visible.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.disk['/workspace/two.txt'] === 'second draft');
    assert.equal(await page.evaluate(() => window.disk['/workspace/one.txt']), 'first');
    await visible.getByRole('tab', { name: 'one.txt', exact: false }).click();
    page.once('dialog', dialog => dialog.dismiss());
    await visible.getByRole('button', { name: 'Close tab one.txt', exact: true }).click();
    assert.equal(await visible.getByRole('tab').count(), 2);
    assert.equal(await visible.locator('textarea').inputValue(), 'first draft');
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-tabs.png' });
    await visible.getByRole('button', { name: 'Separate window', exact: true }).click();
    assert.equal(await visible.count(), 2);
    const first = page.getByRole('dialog', { name: 'one.txt', exact: true });
    const second = page.getByRole('dialog', { name: 'two.txt', exact: true });
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-windows.png' });
    assert.equal(await first.locator('textarea').inputValue(), 'first draft');
    assert.equal(await second.locator('textarea').inputValue(), 'second draft');
    const firstBounds = await first.boundingBox();
    const secondBounds = await second.boundingBox();
    assert.equal(firstBounds.x, secondBounds.x + 24);
    assert.equal(firstBounds.y, secondBounds.y + 24);
    assert.equal(firstBounds.width, secondBounds.width);
    assert.equal(firstBounds.height, secondBounds.height);
    await open('Third file');
    assert.equal(await visible.count(), 2);
    const third = page.getByRole('dialog', { name: 'three.txt', exact: true });
    assert.equal(await third.getByRole('tab').count(), 2);
    await open('First file');
    assert.equal(await page.evaluate(() => window.reads), 3);
    assert.equal(await first.isVisible(), true);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addStyleTag({
      content:
        ':root{--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:#424349}',
    });
    await page.waitForFunction(
      () => document.querySelector('.scratch-tab-window').getBoundingClientRect().width <= 320,
    );
    const bounds = await first.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
    const bar = await first.locator('.scratch-tab-tabbar').boundingBox();
    assert.ok(bar.x >= 0 && bar.x + bar.width <= 320);
    assert.ok(
      (await first.getByRole('button', { name: 'Separate window', exact: true }).boundingBox())
        .height >= 44,
    );
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-tabs-mobile.png' });
    assert.equal(
      await first.getByRole('button', { name: 'Close tab one.txt', exact: true }).isVisible(),
      true,
    );
    assert.ok(
      (await first.getByRole('button', { name: 'Close tab three.txt', exact: true }).boundingBox())
        .width >= 44,
    );
    // Closing an inactive tab must leave the active draft intact.
    await first.getByRole('button', { name: 'Close tab three.txt', exact: true }).click();
    assert.equal(await third.count(), 0);
    assert.equal(await first.locator('textarea').inputValue(), 'first draft');
    assert.equal(await first.getByRole('tab').count(), 1);
    // setViewportSize resolves before Chromium necessarily delivers its resize event.
    // Wait for the viewport resize before opening the next file.
    await page.evaluate(() => {
      window.desktopResize = new Promise(resolve => {
        window.addEventListener('resize', () => requestAnimationFrame(resolve), { once: true });
      });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => window.desktopResize);
    await first.evaluate(node => {
      node.style.top = '90px';
    });
    await second.evaluate(node => {
      node.style.top = '90px';
    });
    await open('Third file');
    // A hidden dirty tab protects the whole window, without closing clean tabs first.
    page.once('dialog', dialog => dialog.dismiss());
    await third.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await third.isVisible(), true);
    assert.equal(await third.getByRole('tab').count(), 2);
    await third.getByRole('tab', { name: 'one.txt', exact: false }).click();
    assert.equal(await first.locator('textarea').inputValue(), 'first draft');
    await first.getByRole('tab', { name: 'three.txt', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await third.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await first.count(), 0);
    assert.equal(await third.count(), 0);
    assert.equal(await second.isVisible(), true);
    assert.equal(await page.evaluate(() => window.drafts.size), 0);
    // The remaining single tab can also be closed with its own X.
    await second.getByRole('button', { name: 'Close tab two.txt', exact: true }).click();
    assert.equal(await visible.count(), 0);
    const savedGeometry = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('scratch-tab:window-geometry:p1')),
    );
    assert.ok(savedGeometry.width >= 280);
    assert.ok(savedGeometry.height >= 180);
    await open('First file');
    const restoredGeometry = await visible.boundingBox();
    assert.equal(restoredGeometry.x, savedGeometry.left);
    assert.equal(restoredGeometry.y, savedGeometry.top);
    assert.equal(restoredGeometry.width, savedGeometry.width);
    assert.equal(restoredGeometry.height, savedGeometry.height);
    assert.equal(await visible.locator('textarea').inputValue(), 'first');
    await open('Third file');
    // Clean groups close together without confirmation.
    await visible.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    await page.evaluate(() => window.cleanup());
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
  } finally {
    await browser.close();
  }
});
