import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule } from './support/runtime.mjs';

test('editor hooks load once, normalize newlines and ignore reads after disposal', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({ contentType: 'text/javascript', body: await runtimeModule(path) });
      return route.fulfill({
        contentType: 'text/html',
        body: '<a href="/api/chats/a/ide-open?path=/workspace/notes.txt">Notes</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      const { mountChat } = await import('/app/chat.js');
      window.reads = 0;
      window.drafts = new Map();
      window.cleanup = mountChat({
        context: { projectId: 'p1', chatId: 'a' },
        drafts: window.drafts,
        launchIde: () => {},
        files: {
          read() {
            window.reads++;
            return new Promise(resolve => {
              window.finishRead = content => resolve({ content, revision: 'original' });
            });
          },
          async save(_path, content) {
            window.saved = content;
            return { revision: 'saved' };
          },
        },
      });
    });
    async function open() {
      await page.getByRole('link', { name: 'Notes', exact: true }).click();
    }
    await open();
    await page.waitForFunction(() => window.reads === 1);
    assert.equal(await page.locator('textarea').evaluate(node => node.readOnly), true);
    await page.evaluate(() => window.finishRead('one\r\ntwo\rthree\n'));
    await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
    assert.equal(await page.locator('textarea').inputValue(), 'one\ntwo\nthree\n');
    await page.locator('textarea').fill('edited\ntext\n');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.saved === 'edited\r\ntext\r\n');
    assert.equal(await page.evaluate(() => window.reads), 1);
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await open();
    await page.waitForFunction(() => window.reads === 2);
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.evaluate(async () => {
      window.finishRead('late content');
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    assert.equal(await page.evaluate(() => window.drafts.size), 0);
    await page.evaluate(() => window.cleanup());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
