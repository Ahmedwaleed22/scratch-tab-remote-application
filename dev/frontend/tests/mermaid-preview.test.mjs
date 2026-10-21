import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.mjs';

test('Mermaid preview renders installer flowcharts, retains source and handles invalid diagrams', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({ contentType: 'text/javascript', body: await runtimeModule(path) });
      return route.fulfill({
        contentType: 'text/html',
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><a href="/api/chats/a/ide-open?path=/workspace/README.md">Installer</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    const diagram = `flowchart TD
    Start["Run infra/install.sh with hostname"] --> Root["Validate root and options"]
    Root --> Checkout["Select target checkout and re-execute its installer"]
    Checkout --> Validate["Validate distro and DNS"]
    Validate --> Deps["Install pinned host dependencies"]
    Deps --> Agents["Converge catalog-declared host agent CLIs"]
    Agents --> Build["Build frontend and Go backend"]
    Build --> Proxy["Render, validate, and reload Caddy"]
    Proxy --> Service["Install and start systemd backend service"]
    Service --> Health["Poll backend health for up to 30 seconds"]
    Health --> Image["Build reusable LXD workspace image"]
    Image --> SSH["Disable SSH password authentication"]
    SSH --> Heal["Enable minutely LXD IPv4 repair timer"]
    Heal --> Ready["Open app and claim administrator"]`;
    const text = '```mermaid\n' + diagram + '\n```';
    await page.evaluate(async text => {
      const { default: activate } = await window.importModule('/main.js');
      activate({
        slots: { chatHeaderActions: 'chat', sidebarHeaderActions: 'sidebar' },
        backend: {
          async call() {
            return { content: text, revision: 'initial' };
          },
        },
        ui: {
          register(slot, mount) {
            if (slot === 'sidebar') window.dispose = mount();
            if (slot === 'chat') mount(document.body, { chatId: 'a', projectId: 'p1' });
          },
        },
      });
    }, text);
    await page.getByRole('link', { name: 'Installer', exact: true }).click();
    const preview = page.getByRole('article', { name: 'README.md Markdown preview' });
    const drawing = preview.locator('.scratch-tab-mermaid svg');
    await drawing.waitFor();
    assert.equal(await drawing.locator('.node').count(), 14);
    assert.match(
      (await drawing.locator('.node').allTextContents()).join('').replace(/\s+/g, ''),
      /Openappandclaimadministrator/,
    );
    await page.getByRole('button', { name: 'Show Markdown source' }).click();
    assert.equal(await page.locator('textarea').inputValue(), text);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.getByRole('button', { name: 'Show Markdown preview' }).click();
    await drawing.waitFor();
    const container = preview.locator('.scratch-tab-mermaid');
    const bounds = await container.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
    assert.equal(
      await container.evaluate(node => node.scrollWidth > node.clientWidth),
      true,
      'wide diagrams remain readable and scroll within the phone viewport',
    );
    await page.getByRole('button', { name: 'Show Markdown source' }).click();
    await page.locator('textarea').fill('```mermaid\nflowchart TD\n A[broken\n```');
    await page.getByRole('button', { name: 'Show Markdown preview' }).click();
    await preview.getByText('Unable to render Mermaid diagram.').waitFor();
    assert.match(
      await preview.locator('pre:not([hidden]) > code.language-mermaid').textContent(),
      /A\[broken/,
    );
    await page.evaluate(() => window.dispose());
    assert.equal(await page.locator('.scratch-tab-markdown').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
