import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule } from './support/runtime.mjs';

test('production bundle renders Mermaid diagrams after an invalid block and disposes cleanly', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://remote.test/**', async route => {
      if (new URL(route.request().url()).pathname === '/main.js')
        return route.fulfill({
          contentType: 'text/javascript',
          body: await runtimeModule('/main.js'),
        });
      return route.fulfill({
        contentType: 'text/html',
        body: '<a href="/api/chats/a/ide-open?path=/workspace/diagram.md">Diagram</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      localStorage.setItem('scratch-tab:markdown-view', 'source');
      const { default: activate } = await import('/main.js');
      activate({
        slots: { chatHeaderActions: 'chat', sidebarHeaderActions: 'sidebar' },
        backend: {
          async call() {
            return {
              content:
                '```mermaid\nnot a diagram\n```\n\n```mermaid\nflowchart TD\n A[Install] --> B[Ready]\n```\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: Hello\n```',
              revision: 'initial',
            };
          },
        },
        ui: {
          register(slot, mount) {
            if (slot === 'sidebar') window.dispose = mount();
            if (slot === 'chat') mount(document.body, { chatId: 'a', projectId: 'p1' });
          },
        },
      });
    });
    await page.getByRole('link', { name: 'Diagram', exact: true }).click();
    const toggle = page.getByRole('button', { name: 'Show Markdown preview', exact: true });
    await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
    await toggle.click();
    await page.getByText('Unable to render Mermaid diagram.').waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll('.scratch-tab-mermaid svg').length === 2,
    );
    assert.match(await page.getByRole('article').textContent(), /Install/);
    assert.match(await page.locator('.scratch-tab-mermaid').last().textContent(), /Alice/);
    const ids = await page
      .locator('.scratch-tab-mermaid svg')
      .evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(new Set(ids).size, 2);
    await page.getByRole('button', { name: 'Show Markdown source' }).click();
    await toggle.click();
    // Closing during async rendering must not restore content or leak staging elements.
    await page.evaluate(() => window.dispose());
    await page.waitForFunction(() => !document.querySelector('[id^="scratch-mermaid-"]'));
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
