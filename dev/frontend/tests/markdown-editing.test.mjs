import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule } from './support/runtime.mjs';

test('Markdown source and preview retain unsaved edits, save exact source and fit phones', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({
          contentType: 'text/javascript',
          body: await runtimeModule(path),
        });
      if (path.endsWith('/files/download'))
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        });
      return route.fulfill({
        contentType: 'text/html',
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><a href="/api/chats/a/ide-open?path=/workspace/docs/README.md">Markdown file</a><a href="/api/chats/a/ide-open?path=/workspace/notes.txt">Text file</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      localStorage.setItem('scratch-tab:markdown-view', 'source');
      const { mountChat } = await import('/app/chat.js');
      window.disk = '# Original\r\n\r\n**bold** and *italic*\r\n';
      window.cleanup = mountChat({
        context: { chatId: 'a', projectId: 'p1' },
        drafts: new Map(),
        launchIde: () => {},
        files: {
          async read(path) {
            return {
              content: path.endsWith('.md') ? window.disk : 'plain text',
              revision: 'initial',
            };
          },
          async save(path, content) {
            window.savedPath = path;
            window.disk = content;
            return { revision: 'saved' };
          },
        },
      });
    });
    const open = async name => {
      await page.getByRole('link', { name, exact: true }).click({ force: true });
    };
    await open('Markdown file');
    const visible = page.locator('.scratch-tab-window:visible');
    const input = visible.locator('textarea');
    const preview = visible.getByRole('article', { name: 'README.md Markdown preview' });
    const showPreview = visible.getByRole('button', { name: 'Show Markdown preview', exact: true });
    await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
    assert.equal(await showPreview.isVisible(), true);
    await showPreview.click();
    await preview.getByRole('heading', { name: 'Original' }).waitFor();
    assert.equal(await input.isVisible(), false);
    assert.equal(await preview.locator('strong').textContent(), 'bold');
    assert.equal(
      await visible.getByRole('button', { name: 'Save', exact: true }).isDisabled(),
      true,
    );
    await visible.getByRole('button', { name: 'Show Markdown source' }).press('Enter');
    assert.equal(await input.inputValue(), '# Original\n\n**bold** and *italic*\n');
    const edited =
      '# Updated\n\n**unsaved**\n\n| Name | Value |\n| - | - |\n| Test | 42 |\n\n```js\nconst text = "<img src=x onerror=alert(1)>";\n```\n\n```mermaid\nflowchart TD\n  A[Install] --> B[Ready]\n```\n\n```mermaid\nnot a diagram\n```\n\n<script>window.bad = true</script>\n';
    await input.fill(edited);
    await showPreview.click();
    await preview.getByRole('heading', { name: 'Updated' }).waitFor();
    assert.equal(await preview.locator('script,img').count(), 0);
    assert.equal(await preview.locator('table').count(), 1);
    await preview.locator('.scratch-tab-mermaid svg').waitFor({ timeout: 5000 });
    assert.match(
      await preview.getByRole('img', { name: 'Mermaid diagram' }).textContent(),
      /Install/,
    );
    await preview.getByText('Unable to render Mermaid diagram.').waitFor();
    const lightDiagramId = await preview.locator('.scratch-tab-mermaid svg').getAttribute('id');
    assert.match(
      await preview.locator('pre:not([hidden]) > code.language-mermaid').textContent(),
      /not a diagram/,
    );
    assert.equal(
      await visible.getByRole('button', { name: 'Save', exact: true }).isEnabled(),
      true,
    );
    page.once('dialog', dialog => dialog.dismiss());
    await visible.getByRole('button', { name: 'Close window' }).click();
    assert.equal(await preview.isVisible(), true);
    await preview.press('Control+s');
    await page.waitForFunction(() => window.disk.startsWith('# Updated\r\n'));
    assert.equal(await page.evaluate(() => window.disk), edited.replaceAll('\n', '\r\n'));
    assert.equal(await page.evaluate(() => window.savedPath), '/workspace/docs/README.md');
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-markdown-light.png' });
    await open('Text file');
    assert.equal(await visible.getByRole('button', { name: 'Show Markdown preview' }).count(), 0);
    await visible.getByRole('tab', { name: 'README.md', exact: true }).click();
    assert.equal(await preview.isVisible(), true);
    await page.evaluate(() => window.cleanup.setContext({ chatId: 'b', projectId: 'p1' }));
    assert.equal(await preview.isVisible(), true);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.cssText =
        '--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:#424349';
    });
    await page.waitForFunction(
      () => document.querySelector('.scratch-tab-window').getBoundingClientRect().width <= 320,
    );
    await page.waitForFunction(previous => {
      const diagram = document.querySelector('.scratch-tab-mermaid svg');
      return diagram && diagram.id !== previous;
    }, lightDiagramId);
    assert.equal(await preview.locator('.scratch-tab-mermaid svg').isVisible(), true);
    assert.equal(
      await preview.locator('table').evaluate(node => getComputedStyle(node).color),
      await preview.evaluate(node => getComputedStyle(node).color),
    );
    for (const locator of [
      preview,
      visible.getByRole('button', { name: 'Show Markdown source' }),
      visible.getByRole('button', { name: 'Save', exact: true }),
      visible.getByRole('button', { name: 'Open with default editor' }),
    ]) {
      const box = await locator.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 320);
    }
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({
        path: process.env.SCRATCH_TAB_SCREENSHOTS + '-markdown-mobile-dark.png',
      });
    await visible.getByRole('button', { name: 'Show Markdown source' }).click();
    assert.equal(await input.inputValue(), edited);
    assert.equal(await input.isVisible(), true);
    await page.evaluate(() => window.cleanup());
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
