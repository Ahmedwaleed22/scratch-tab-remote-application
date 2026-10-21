import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.js';

test('phone editor stays inside the visible viewport through keyboard and rotation changes', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
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
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><a id="file" href="#">README.md</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      const { mountEditorWindow } = await window.importModule('/app/editor.js');
      const { EditorDocument } = await window.importModule('/services/editorDocument.js');
      const { windowGeometry } = await window.importModule('/adapters/windowGeometry.js');
      window.saved = '';
      window.openCount = 0;
      const documentModel = new EditorDocument('/workspace/README.md', 'phone', new Map(), {
        async read() {
          return { content: '# README\n\nEditable on a phone.', revision: 'initial' };
        },
        async save(_path, content) {
          window.saved = content;
          return { revision: 'saved' };
        },
      });
      window.view = mountEditorWindow({
        target: {
          name: 'a-very-long-file-name-in-a-deep-folder.md',
          path: '/workspace/README.md',
          ide: '',
          download: '',
        },
        documentModel,
        index: 5,
        layoutPersistence: windowGeometry(undefined),
        nextLayer: () => 201,
        launchIde: () => window.openCount++,
        onClosed: () => {},
      });
    });
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
    assert.equal(await page.evaluate(() => document.activeElement!.tagName), 'ARTICLE');
    await page.getByRole('button', { name: 'Show Markdown source' }).tap();
    await page.locator('.scratch-tab-header').focus();
    assert.equal(await page.evaluate(() => document.activeElement!.tagName), 'HEADER');
    async function assertFits(width: number, height: number, top = 0, left = 0) {
      // Browser resize events arrive asynchronously after setViewportSize resolves.
      await page.waitForFunction(
        ({ width, height, top, left }) => {
          const box = document
            .querySelector<HTMLElement>('.scratch-tab-window')!
            .getBoundingClientRect();
          return (
            box.x >= left &&
            box.y >= top &&
            box.right <= left + width + 1 &&
            box.bottom <= top + height + 1
          );
        },
        { width, height, top, left },
      );
      for (const selector of [
        '.scratch-tab-window',
        '.scratch-tab-header',
        'textarea',
        '.scratch-tab-actions button:first-child',
        '.scratch-tab-actions button:last-child',
        '.scratch-tab-controls button',
        'footer',
      ]) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box);
        assert.ok(
          box.x >= left &&
            box.y >= top &&
            box.x + box.width <= left + width + 1 &&
            box.y + box.height <= top + height + 1,
          `${selector}: ${JSON.stringify(box)} outside ${width}x${height} at ${left},${top}`,
        );
      }
    }
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await assertFits(width, 844);
      assert.equal(
        await page.locator('textarea').evaluate(node => getComputedStyle(node).fontSize),
        '16px',
      );
      for (const button of await page.locator('.scratch-tab-window button:visible').all())
        assert.ok((await button.boundingBox())!.height >= 44);
    }
    await page.locator('textarea').fill('Mobile edit');
    await page.getByRole('button', { name: 'Save', exact: true }).tap();
    assert.equal(await page.evaluate(() => window.saved), 'Mobile edit');
    await page.getByRole('button', { name: 'Open with default editor' }).tap();
    assert.equal(await page.evaluate(() => window.openCount), 1);
    // Model the visual viewport shrinking and panning while Safari's keyboard is open.
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      for (const [key, value] of Object.entries({
        width: 430,
        height: 340,
        offsetLeft: 0,
        offsetTop: 160,
      }))
        Object.defineProperty(viewport, key, { configurable: true, writable: true, value });
      viewport.dispatchEvent(new Event('resize'));
    });
    await assertFits(430, 340, 160);
    assert.equal(await page.locator('textarea').inputValue(), 'Mobile edit');
    await page.evaluate(() => {
      Object.assign(window.visualViewport!, {
        width: 390,
        height: 300,
        offsetLeft: 20,
        offsetTop: 180,
      });
      window.visualViewport!.dispatchEvent(new Event('scroll'));
    });
    await assertFits(390, 300, 180, 20);
    await page.evaluate(() => {
      for (const key of ['width', 'height', 'offsetLeft', 'offsetTop'])
        Reflect.deleteProperty(window.visualViewport!, key);
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await assertFits(844, 390);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertFits(390, 844);
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-mobile.png' });
    await page.getByRole('button', { name: 'Close window' }).tap();
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
  } finally {
    await browser.close();
  }
});
