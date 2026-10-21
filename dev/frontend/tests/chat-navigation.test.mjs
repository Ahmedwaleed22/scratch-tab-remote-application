import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.mjs';

test('same-project chat navigation preserves open tabs, geometry and saves without rereading', async () => {
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
        body: '<div id="host"></div><a id="file">File</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      const { default: activate } = await window.importModule('/main.js');
      window.reads = 0;
      window.writes = [];
      window.originals = [];
      window.ideUrls = [];
      window.open = url => window.ideUrls.push(url);
      activate({
        application: { id: 'scratch-tab' },
        slots: {
          chatHeaderActions: 'header',
          applicationCardActions: 'card',
          sidebarHeaderActions: 'sidebar',
        },
        backend: {
          async call(path, options) {
            if (options.body.save) {
              window.writes.push(options);
              return { revision: 'saved' };
            }
            window.reads++;
            return { content: 'content ' + options.body.path, revision: 'original' };
          },
        },
        ui: {
          register(slot, render) {
            if (slot === 'header') window.render = render;
            if (slot === 'sidebar') window.ownerCleanup = render();
          },
        },
      });
      window.navigate = (chatId, projectId = 'p1') => {
        window.dispose?.();
        window.chatId = chatId;
        window.dispose = window.render(document.querySelector('#host'), {
          chatId,
          projectId,
          cwd: `/var/lib/remote/projects/${projectId}/workspace`,
        });
      };
      window.navigate('a');
    });
    const open = async path => {
      await page.evaluate(path => {
        document.querySelector('#file').href =
          `/api/chats/${window.chatId}/ide-open?path=/workspace/${path}`;
      }, path);
      await page.getByRole('link', { name: 'File', exact: true }).click({ force: true });
    };
    await open('one.txt');
    await page.locator('textarea:visible').fill('keep my draft');
    await page.evaluate(() => {
      window.oldRowOpens = 0;
      const pane = document.createElement('div');
      pane.id = 'workspace-files-pane';
      const row = document.createElement('div');
      row.id = 'row';
      row.setAttribute('role', 'button');
      row.textContent = 'two.txt';
      const download = document.createElement('a');
      download.download = 'two.txt';
      download.href = '/api/chats/a/files/download?path=two.txt';
      row.append(download);
      row.addEventListener('click', () => window.oldRowOpens++);
      pane.append(row);
      document.body.append(pane);
    });
    await page.locator('#row').click({ force: true });
    await page.getByRole('tab', { name: 'one.txt', exact: false }).click();
    await page.locator('.scratch-tab-window:visible').evaluate(node => {
      node.style.left = '140px';
      node.style.width = '650px';
    });
    await page.evaluate(() => {
      window.originals = [...document.querySelectorAll('.scratch-tab-window')];
      window.dispose();
    });
    // Keyed chat unmounts clean up before the new chat's effects are mounted.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    assert.equal(await page.evaluate(() => window.originals.every(node => node.isConnected)), true);
    assert.equal(await page.locator('.scratch-tab-window:visible').count(), 0);
    await page.evaluate(() => window.navigate('b'));
    assert.equal(await page.locator('.scratch-tab-window').count(), 2);
    assert.equal(await page.evaluate(() => window.originals.every(node => node.isConnected)), true);
    assert.equal(await page.getByRole('tab').count(), 2);
    assert.equal(await page.locator('textarea:visible').inputValue(), 'keep my draft');
    assert.equal(
      await page.locator('.scratch-tab-window:visible').evaluate(node => node.style.left),
      '140px',
    );
    assert.equal(await page.evaluate(() => window.reads), 2);
    await page.getByRole('tab', { name: 'two.txt', exact: true }).click();
    await page.getByRole('button', { name: 'Open with default editor', exact: true }).click();
    assert.equal(await page.evaluate(() => window.oldRowOpens), 0);
    assert.match(await page.evaluate(() => window.ideUrls.at(-1)), /\/api\/chats\/b\/ide-open/);
    await page.getByRole('tab', { name: 'one.txt', exact: false }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.writes.length === 1);
    assert.equal(await page.evaluate(() => window.writes[0].projectId), 'p1');
    await page.getByRole('button', { name: 'Open with default editor', exact: true }).click();
    assert.match(await page.evaluate(() => window.ideUrls.at(-1)), /\/api\/chats\/b\/ide-open/);
    const oldIntercepted = await page.evaluate(() => {
      const anchor = document.querySelector('#file');
      anchor.href = '/api/chats/a/ide-open?path=/workspace/stale.txt';
      window.oldIntercepted = undefined;
      anchor.addEventListener(
        'click',
        event => {
          window.oldIntercepted = event.defaultPrevented;
          event.preventDefault();
        },
        { once: true },
      );
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return window.oldIntercepted;
    });
    assert.equal(oldIntercepted, false);
    await open('three.txt');
    assert.equal(await page.getByRole('tab').count(), 3);
    assert.equal(await page.evaluate(() => window.reads), 3);
    await page.getByRole('button', { name: 'Separate window', exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-window:visible').count(), 2);
    await open('report.docx');
    await page.getByRole('heading', { name: 'File not supported' }).waitFor();
    await page.evaluate(() => window.navigate('d'));
    assert.equal(await page.locator('.scratch-tab-window:visible').count(), 2);
    assert.equal(
      await page.getByRole('link', { name: 'Download file', exact: true }).getAttribute('href'),
      '/api/chats/d/files/download?path=report.docx',
    );
    await page.evaluate(() => window.navigate('c', 'p2'));
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    await open('one.txt');
    assert.equal(await page.locator('textarea:visible').inputValue(), 'content /workspace/one.txt');
    await page.evaluate(() => {
      window.dispose();
      window.ownerCleanup();
    });
    await page.waitForFunction(() => document.querySelectorAll('.scratch-tab-window').length === 0);
  } finally {
    await browser.close();
  }
});
