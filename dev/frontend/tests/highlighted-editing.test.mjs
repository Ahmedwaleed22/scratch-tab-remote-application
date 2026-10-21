import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule } from './support/runtime.mjs';

test('highlighted editing preserves content, native undo, scrolling and phone layout', async () => {
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
      return route.fulfill({
        contentType: 'text/html',
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><a id="file" href="/api/chats/a/ide-open?path=/workspace/main.js">Source file</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      const { mountChat } = await import('/app/chat.js');
      window.disk =
        'const greeting = "hello <img src=x onerror=alert(1)>";\r\n// comment\r\nconst count = 42;\r\n';
      window.cleanup = mountChat({
        context: { chatId: 'a', projectId: 'p1' },
        drafts: new Map(),
        launchIde: () => {},
        files: {
          async read() {
            return { content: window.disk, revision: 'initial' };
          },
          async save(path, content) {
            window.disk = content;
            return { revision: 'saved' };
          },
        },
      });
    });
    const open = async name => {
      await page.evaluate(
        name =>
          (document.querySelector('#file').href = '/api/chats/a/ide-open?path=/workspace/' + name),
        name,
      );
      await page.getByRole('link', { name: 'Source file' }).click({ force: true });
    };
    await open('main.js');
    const visible = page.locator('.scratch-tab-window:visible');
    const input = visible.locator('textarea');
    const paint = visible.locator('pre');
    await paint.locator('.hljs-keyword').first().waitFor();
    assert.equal(await paint.getAttribute('aria-hidden'), 'true');
    assert.equal(await visible.locator('img').count(), 0);
    assert.equal(
      await visible.getByRole('button', { name: 'Save', exact: true }).isDisabled(),
      true,
    );
    assert.equal(await paint.textContent(), (await input.inputValue()) + '\n');
    assert.equal(
      await input.inputValue(),
      'const greeting = "hello <img src=x onerror=alert(1)>";\n// comment\nconst count = 42;\n',
    );
    const keyword = await paint
      .locator('.hljs-keyword')
      .first()
      .evaluate(node => getComputedStyle(node).color);
    const string = await paint
      .locator('.hljs-string')
      .first()
      .evaluate(node => getComputedStyle(node).color);
    assert.notEqual(keyword, string);
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-syntax-light.png' });
    await input.fill('const value = "مرحبا 😀";\n');
    await input.press('End');
    await page.keyboard.insertText('// native edit');
    await input.press('Control+z');
    assert.equal(await input.inputValue(), 'const value = "مرحبا 😀";\n');
    await visible.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.disk === 'const value = "مرحبا 😀";\r\n');
    // Check plain-text fallback before changing the viewport.
    await open('notes.unknown');
    assert.equal(await visible.locator('pre').count(), 0);
    assert.equal(
      await visible.locator('textarea').inputValue(),
      await page.evaluate(() => window.disk.replaceAll('\r\n', '\n')),
    );
    await visible.getByRole('tab', { name: 'main.js', exact: true }).click();
    const long =
      Array.from(
        { length: 100 },
        (_, i) => `const line${i} = "${'long text '.repeat(14)}"; // comment`,
      ).join('\n') + '\n';
    await input.fill(long);
    await page.waitForFunction(
      () =>
        document.querySelector('.scratch-tab-window pre').textContent ===
        document.querySelector('textarea').value + '\n',
    );
    await input.evaluate(node => {
      node.scrollTop = 400;
      node.dispatchEvent(new Event('scroll'));
    });
    assert.equal(
      await paint.evaluate(node => node.scrollTop),
      await input.evaluate(node => node.scrollTop),
    );
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.cssText =
        '--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--line:#424349';
    });
    await page.waitForFunction(
      () =>
        document.querySelector('pre').clientWidth ===
        document.querySelector('textarea').clientWidth,
    );
    const mobileKeyword = await paint
      .locator('.hljs-keyword')
      .first()
      .evaluate(node => getComputedStyle(node).color);
    assert.notEqual(mobileKeyword, keyword);
    const box = await visible.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320);
    const metrics = await input.evaluate(node => ({
      height: node.scrollHeight,
      line: parseFloat(getComputedStyle(node).lineHeight),
    }));
    assert.ok(
      Math.abs((await paint.evaluate(node => node.scrollHeight)) - metrics.height) <= metrics.line,
    );
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({
        path: process.env.SCRATCH_TAB_SCREENSHOTS + '-syntax-mobile-dark.png',
      });
    // Long minified input remains editable and unmodified without tokenization.
    await input.fill('const value = "' + 'x'.repeat(9000) + '";');
    await page.waitForFunction(
      () => document.querySelector('pre').querySelectorAll('span').length === 0,
    );
    assert.equal(await paint.textContent(), (await input.inputValue()) + '\n');
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await paint.isVisible(), false);
    assert.notEqual(await input.evaluate(node => getComputedStyle(node).color), 'rgba(0, 0, 0, 0)');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.evaluate(() => window.cleanup());
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
