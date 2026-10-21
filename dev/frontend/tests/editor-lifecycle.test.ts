import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.js';

test('direct file opening, content, controls, modified clicks and disposal', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({
      viewport: { width: Number(process.env.SCRATCH_TAB_WIDTH || 1280), height: 720 },
    });
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({
          contentType: 'text/javascript',
          body: await runtimeModule(path),
        });
      if (path.endsWith('/files/download'))
        return route.fulfill({ body: 'A small file\n<script>safe</script>' });
      return route.fulfill({
        contentType: 'text/html',
        body: '<div id="host"></div><a href="/api/chats/a/ide-open?path=%2Fworkspace%2Fnotes.txt">notes</a>',
      });
    });
    await page.goto('https://remote.test/');
    const dark = process.env.SCRATCH_TAB_THEME === 'dark';
    await page.addStyleTag({
      content: `:root { --bg-surface-rgb:${dark ? '20 21 25' : '244 245 248'}; --bg-raised-rgb:${dark ? '27 28 33' : '255 255 255'}; --fg:${dark ? '227 227 231' : '31 36 44'}; --accent-blue:${dark ? '138 180 255' : '47 111 235'}; --line:${dark ? 'rgba(255,255,255,.07)' : 'rgba(15,20,28,.1)'}; } body { background:${dark ? '#101114' : '#fff'}; color:rgb(var(--fg)); font:13px system-ui; } a {color:rgb(var(--accent-blue));}`,
    });
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      const { default: activate } = await window.importModule('/main.js');
      window.dispose = null;
      window.disk = 'A small file\n<script>safe</script>';
      window.revision = 'original';
      window.failSave = false;
      const backend: NonNullable<RemoteTestFixture['backend']> = {
        async call(path, { body }) {
          window.lastFilePath = body.path;
          if (body.save) {
            if (window.failSave) throw new Error('File changed on disk');
            if (window.deferSave)
              await new Promise<void>(resolve => {
                window.completeSave = resolve;
              });
            window.disk = body.content;
            window.revision = 'saved';
            return { revision: window.revision };
          }
          return { content: window.disk, revision: window.revision };
        },
      };
      const remote: RemoteTestFixture = {
        backend,
        slots: { chatHeaderActions: 'header', sidebarHeaderActions: 'sidebar' },
        ui: {
          register(slot, render) {
            if (slot === 'sidebar') {
              window.ownerCleanup = render()!;
              return;
            }
            if (slot !== 'header') return () => {};
            const cleanup = render(document.querySelector<HTMLElement>('#host')!, {
              chatId: 'a',
              projectId: 'p1',
              cwd: '/var/lib/remote/projects/alpha/workspace',
            })!;
            window.dispose = () => {
              cleanup!();
              window.ownerCleanup();
            };
          },
        },
      };
      window.mount = () => activate(window.createRemote(remote));
      window.mount();
    });
    assert.equal(await page.locator('#host button').count(), 0);
    await page.getByText('notes', { exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-choice').count(), 0);
    await page.waitForFunction(() =>
      document.querySelector<HTMLTextAreaElement>('textarea')!?.value.includes('A small file'),
    );
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-editor.png' });
    assert.equal(await page.locator('script').count(), 0);
    await page.locator('textarea').fill('Edited text');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.disk === 'Edited text');
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
    await page.locator('textarea').fill('Unsaved conflict');
    await page.evaluate(() => {
      window.failSave = true;
    });
    await page.locator('textarea').press('Control+s');
    await page.getByText('File changed on disk', { exact: true }).waitFor();
    assert.equal(await page.locator('textarea').inputValue(), 'Unsaved conflict');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-window').count(), 1);
    await page.evaluate(() => {
      window.failSave = false;
    });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.disk === 'Unsaved conflict');
    assert.equal(await page.locator('.scratch-tab-controls button').count(), 1);
    assert.equal(
      (await page.getByRole('button', { name: 'Close window', exact: true }).textContent())!,
      '',
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Save', exact: true })
        .evaluate(node => !!node.closest('header')),
      true,
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Open with default editor', exact: true })
        .evaluate(node => !!node.closest('header')),
      true,
    );
    const header = page.locator('.scratch-tab-header');
    const before = await page.locator('.scratch-tab-window').boundingBox();
    assert.ok(before);
    await header.focus();
    await header.press('ArrowRight');
    const after = await page.locator('.scratch-tab-window').boundingBox();
    assert.ok(after);
    assert.equal(
      after.x,
      before.x + (Number(process.env.SCRATCH_TAB_WIDTH || 1280) <= 600 ? 0 : 20),
    );
    if (Number(process.env.SCRATCH_TAB_WIDTH || 1280) > 600) {
      await header.evaluate(node => {
        for (let i = 0; i < 20; i++)
          node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      });
      const outside = await page.locator('.scratch-tab-window').boundingBox();
      assert.ok(outside);
      assert.ok(outside.x < 0);
      assert.ok(outside.x + outside.width >= 72);
      await header.evaluate(node => {
        for (let i = 0; i < 150; i++) {
          node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
          node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        }
      });
      const farEdge = await page.locator('.scratch-tab-window').boundingBox();
      assert.ok(farEdge);
      const viewport = page.viewportSize();
      assert.ok(viewport);
      assert.ok(farEdge.x + farEdge.width > viewport.width);
      assert.ok(farEdge.y + farEdge.height > viewport.height);
      assert.ok(farEdge.x <= viewport.width - 72);
      assert.ok(farEdge.y + (await header.boundingBox())!.height <= viewport.height - 8);
      await page.locator('.scratch-tab-window').evaluate((node, bounds) => {
        node.style.left = `${bounds.x}px`;
        node.style.top = `${bounds.y}px`;
      }, after);
    }
    await page.getByRole('button', { name: 'Close window' }).click();
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    await page.getByText('notes', { exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-window').count(), 1);
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
    await page.locator('textarea').fill('Draft survives chat change');
    await page.evaluate(() => window.dispose!());
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    assert.equal(
      await page.evaluate(() => {
        const a = document.querySelector<HTMLAnchorElement>('a')!;
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
        a.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
    );
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('#host')!.replaceChildren();
      window.mount();
    });
    await page.getByText('notes', { exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLTextAreaElement>('textarea')!?.value ===
        'Draft survives chat change',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.disk === 'Draft survives chat change');
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.evaluate(() => {
      window.disk = '';
    });
    await page.getByText('notes', { exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
    assert.equal(await page.locator('textarea').inputValue(), '');
    await page.locator('textarea').fill('Write an empty file');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.disk === 'Write an empty file');
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.evaluate(() => {
      window.disk = 'one\r\ntwo\r\n';
    });
    await page.getByText('notes', { exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
    assert.equal(await page.locator('textarea').inputValue(), 'one\ntwo\n');
    await page.locator('textarea').fill('changed\n');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.disk === 'changed\r\n');
    await page.evaluate(() => {
      window.deferSave = true;
    });
    await page.locator('textarea').fill('pending\n');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => typeof window.completeSave === 'function');
    await page.locator('textarea').fill('newer\n');
    await page.evaluate(() => {
      window.deferSave = false;
      window.completeSave();
    });
    await page.getByText('Saved earlier changes · Unsaved edits remain', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.disk), 'pending\r\n');
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), false);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.disk === 'newer\r\n');
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.evaluate(() => {
      document.querySelector<HTMLAnchorElement>('a')!.href =
        'https://code--alpha.remote.test/_static/remote-open.html?folder=%2Fworkspace&file=%2Fworkspace%2FREADME.md&line=3';
      window.open = (...args) => {
        window.opened = args;
        return null;
      };
    });
    await page.getByText('notes', { exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-window').count(), 1);
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
    assert.equal(await page.locator('.scratch-tab-window').getAttribute('aria-label'), 'README.md');
    await page.getByRole('button', { name: 'Open with default editor' }).click();
    assert.match(
      await page.evaluate(() => String(window.opened[0]!)),
      /code--alpha.*README.md&line=3/,
    );
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.getByText('notes', { exact: true }).click();
    await page.getByRole('button', { name: 'Open with default editor' }).click();
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.match(
      await page.evaluate(() => String(window.opened[0]!)),
      /code--alpha.*README.md&line=3/,
    );
    await page.evaluate(() => {
      const pane = document.createElement('aside');
      pane.id = 'workspace-files-pane';
      pane.innerHTML =
        '<div id="manager-file" role="button" tabindex="0" title="Open guide.md in application"><span>guide.md</span><a download="guide.md" href="/api/chats/a/files/download?path=docs%2Fguide.md">Download</a></div><div id="manager-folder" role="button" tabindex="0"><span>docs</span><a href="/api/chats/a/files/download-folder?path=docs">Download folder</a></div><div id="manager-media" role="button" title="View photo.png"><span>photo.png</span><a download="photo.png" href="/api/chats/a/files/download?path=photo.png">Download</a></div>';
      document.body.append(pane);
      window.originalOpens = 0;
      window.folderOpens = 0;
      window.mediaOpens = 0;
      window.downloads = 0;
      const row = document.querySelector<HTMLElement>('#manager-file')!;
      row.onclick = () => {
        window.originalOpens++;
        window.open(
          'https://code--alpha.remote.test/_static/remote-open.html?file=/workspace/docs/guide.md',
          '_blank',
        );
      };
      row.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          row.click();
        }
      };
      row.querySelector('a')!.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        window.downloads++;
      };
      document.querySelector<HTMLElement>('#manager-folder')!.onclick = () => window.folderOpens++;
      document.querySelector<HTMLElement>('#manager-media')!.onclick = () => window.mediaOpens++;
    });
    await page.locator('#manager-file span').click();
    assert.equal(await page.evaluate(() => window.originalOpens), 0);
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
    assert.equal(await page.locator('.scratch-tab-window').getAttribute('aria-label'), 'guide.md');
    assert.equal(await page.evaluate(() => window.lastFilePath), '/workspace/docs/guide.md');
    await page.getByRole('button', { name: 'Open with default editor' }).click();
    assert.equal(await page.evaluate(() => window.originalOpens), 1);
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.locator('#manager-file').focus();
    await page.locator('#manager-file').press('Enter');
    await page.getByRole('button', { name: 'Open with default editor' }).click();
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await page.evaluate(() => window.originalOpens), 2);
    await page.locator('#manager-file').focus();
    await page.locator('#manager-file').press('Space');
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.locator('#manager-file a').click();
    assert.equal(await page.evaluate(() => window.downloads), 1);
    await page.locator('#manager-folder span').click();
    await page.locator('#manager-media span').click();
    assert.equal(await page.evaluate(() => window.folderOpens), 1);
    assert.equal(await page.evaluate(() => window.mediaOpens), 1);
    assert.equal(await page.locator('.scratch-tab-choice').count(), 0);
    await page.getByText('notes', { exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-window').count(), 1);
    await page.evaluate(() => window.dispose!());
    assert.equal(await page.locator('.scratch-tab-choice').count(), 0);
  } finally {
    await browser.close();
  }
});
