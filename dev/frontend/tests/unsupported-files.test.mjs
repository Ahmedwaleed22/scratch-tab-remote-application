import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.mjs';

test('unsupported Word and binary files offer a download instead of an empty editor', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({
          contentType: 'text/javascript',
          body: await runtimeModule(path),
        });
      if (path.endsWith('/files/download'))
        return route.fulfill({
          body: 'original binary content',
          headers: {
            'Content-Disposition': 'attachment; filename="report.docx"',
            'Content-Type': 'application/octet-stream',
          },
        });
      return route.fulfill({
        contentType: 'text/html',
        body: '<meta name="viewport" content="width=device-width, initial-scale=1">',
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
      window.reads = 0;
      window.showFile = (name, error) => {
        window.editor?.close(true);
        const target = {
          name,
          path: '/workspace/' + name,
          download: '/api/chats/a/files/download?path=' + encodeURIComponent(name),
        };
        const documentModel = new EditorDocument(target.path, name, new Map(), {
          read() {
            window.reads++;
            return Promise.reject(new Error(error));
          },
          save() {
            throw new Error('Unsupported files cannot be saved');
          },
        });
        window.editor = mountEditorWindow({
          target,
          documentModel,
          launchIde: () => {},
          onClosed: () => {},
          index: 0,
          layoutPersistence: windowGeometry(undefined),
          nextLayer: () => 201,
        });
      };
      window.showFile('report.DOCX');
    });
    await page.getByRole('heading', { name: 'File not supported' }).waitFor();
    assert.equal(await page.evaluate(() => window.reads), 0);
    assert.equal(await page.locator('textarea').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isVisible(), false);
    assert.equal(
      await page.getByRole('button', { name: 'Open with default editor' }).isVisible(),
      false,
    );
    const download = page.getByRole('link', { name: 'Download file' });
    assert.equal(
      await download.getAttribute('href'),
      '/api/chats/a/files/download?path=report.DOCX',
    );
    const pendingDownload = page.waitForEvent('download');
    await download.click();
    assert.equal((await pendingDownload).suggestedFilename(), 'report.DOCX');
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addStyleTag({
      content:
        ':root{--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:#424349}',
    });
    await page.evaluate(() => window.showFile('report.doc', ''));
    const buttonBox = await download.boundingBox();
    assert.ok(
      buttonBox.width > 44 &&
        buttonBox.height >= 44 &&
        buttonBox.x >= 0 &&
        buttonBox.x + buttonBox.width <= 320,
    );
    await download.focus();
    assert.equal(await download.evaluate(node => node === document.activeElement), true);
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-unsupported.png' });
    await page.evaluate(() =>
      window.showFile('archive.zip', 'Only UTF-8 text files up to 128 KiB are supported.'),
    );
    await page.getByRole('heading', { name: 'File not supported' }).waitFor();
    assert.equal(await page.evaluate(() => window.reads), 1);
    assert.equal(
      await download.getAttribute('href'),
      '/api/chats/a/files/download?path=archive.zip',
    );
    await page.evaluate(() => window.showFile('notes.txt', 'Project unavailable'));
    await page.getByText('Project unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'File not supported' }).count(), 0);
    await page.getByRole('button', { name: 'Close window' }).click();
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
  } finally {
    await browser.close();
  }
});
