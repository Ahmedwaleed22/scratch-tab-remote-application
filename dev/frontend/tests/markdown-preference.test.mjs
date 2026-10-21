import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.mjs';

test('Markdown defaults to preview and remembers both choices across files and reloads', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({ contentType: 'text/javascript', body: await runtimeModule(path) });
      return route.fulfill({
        contentType: 'text/html',
        body: '<a id="file" href="/api/chats/a/ide-open?path=/workspace/one.md">File</a>',
      });
    });
    const mount = async () => {
      await page.goto('https://remote.test/');
      await page.addStyleTag({
        content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
      });
      await page.evaluate(async () => {
        const { mountChat } = await window.importModule('/app/chat.js');
        window.cleanup = mountChat({
          context: { chatId: 'a', projectId: 'p1' },
          drafts: new Map(),
          launchIde: () => {},
          files: {
            async read() {
              return { content: '# Remembered', revision: 'initial' };
            },
            async save() {
              return { revision: 'saved' };
            },
          },
        });
      });
    };
    const open = async name => {
      await page.locator('#file').evaluate((node, name) => {
        node.href = '/api/chats/a/ide-open?path=/workspace/' + name;
      }, name);
      await page.getByRole('link', { name: 'File', exact: true }).click({ force: true });
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.scratch-tab-window')].some(
          node =>
            node.style.display !== 'none' && node.querySelector('textarea')?.readOnly === false,
        ),
      );
    };
    const visible = page.locator('.scratch-tab-window:visible');
    await mount();
    await open('one.md');
    await visible.getByRole('heading', { name: 'Remembered' }).waitFor();
    assert.equal(await page.locator('.scratch-tab-choice').count(), 0);
    await visible.getByRole('button', { name: 'Show Markdown source' }).click();
    await open('two.markdown');
    assert.equal(await visible.locator('textarea').isVisible(), true);
    await page.evaluate(() => window.cleanup());
    await mount();
    await open('three.md');
    assert.equal(await visible.locator('textarea').isVisible(), true);
    await visible.getByRole('button', { name: 'Show Markdown preview' }).click();
    await page.evaluate(() => window.cleanup());
    await mount();
    await open('four.md');
    await visible.getByRole('heading', { name: 'Remembered' }).waitFor();
    await open('plain.txt');
    assert.equal(await visible.locator('textarea').isVisible(), true);
    assert.equal(await visible.getByRole('button', { name: 'Show Markdown source' }).count(), 0);
    await page.evaluate(() => window.cleanup());
    await page.addInitScript(() =>
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('Storage blocked');
        },
      }),
    );
    await mount();
    await open('blocked.md');
    await visible.getByRole('heading', { name: 'Remembered' }).waitFor();
    await visible.getByRole('button', { name: 'Show Markdown source' }).click();
    await open('blocked-two.md');
    assert.equal(await visible.locator('textarea').isVisible(), true);
    await page.evaluate(() => window.cleanup());
  } finally {
    await browser.close();
  }
});
