import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { importFixtureModule, installBrowserImports, runtimeModule } from './support/runtime.js';

test('file tabs retain independent edits, detach into windows, and protect dirty closes', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><a href="/api/chats/a/ide-open?path=/workspace/one.txt">First file</a><a href="/api/chats/a/ide-open?path=/workspace/two.txt">Second file</a><a href="/api/chats/a/ide-open?path=/workspace/three.txt">Third file</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      const { mountChat } = await window.importModule('/app/chat.js');
      window.fileContents = {
        '/workspace/one.txt': 'first',
        '/workspace/two.txt': 'second',
        '/workspace/three.txt': 'third',
      };
      window.reads = 0;
      window.drafts = new Map();
      window.chatCleanup = mountChat({
        context: { chatId: 'a', projectId: 'p1' },
        drafts: window.drafts,
        launchIde: () => {},
        files: {
          async read(path) {
            window.reads++;
            return { content: window.fileContents[path]!, revision: 'initial' };
          },
          async save(path, content) {
            window.fileContents[path] = content;
            return { revision: 'saved' };
          },
        },
      });
    });
    const open = async (name: string) => {
      await page.getByRole('link', { name }).click({ force: true });
    };
    const visible = page.locator('.scratch-tab-window:visible');
    await open('First file');
    await visible.locator('textarea').fill('first draft');
    await visible.evaluate(node => {
      node.style.left = '120px';
      node.style.width = '700px';
    });
    await open('Second file');
    assert.equal(await visible.evaluate(node => node.style.left), '120px');
    assert.equal(await visible.evaluate(node => node.style.width), '700px');
    assert.equal(await visible.count(), 1);
    assert.equal(await visible.getByRole('tab').count(), 2);
    assert.equal(await visible.locator('textarea').inputValue(), 'second');
    await visible.locator('textarea').fill('second draft');
    await visible.getByRole('tab', { name: 'one.txt', exact: false }).click();
    assert.equal(await visible.locator('textarea').inputValue(), 'first draft');
    await visible.getByRole('tab', { name: 'one.txt', exact: false }).press('ArrowRight');
    assert.equal(await visible.locator('textarea').inputValue(), 'second draft');
    assert.equal(
      await visible
        .getByRole('tab', { selected: true })
        .evaluate(node => node === document.activeElement),
      true,
    );
    await visible.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.fileContents['/workspace/two.txt'] === 'second draft');
    assert.equal(await page.evaluate(() => window.fileContents['/workspace/one.txt']), 'first');
    await visible.getByRole('tab', { name: 'one.txt', exact: false }).click();
    page.once('dialog', dialog => dialog.dismiss());
    await visible.getByRole('button', { name: 'Close tab one.txt', exact: true }).click();
    assert.equal(await visible.getByRole('tab').count(), 2);
    assert.equal(await visible.locator('textarea').inputValue(), 'first draft');
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-tabs.png' });
    await visible.getByRole('button', { name: 'Separate window', exact: true }).click();
    assert.equal(await visible.count(), 2);
    const first = page.getByRole('dialog', { name: 'one.txt', exact: true });
    const second = page.getByRole('dialog', { name: 'two.txt', exact: true });
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-windows.png' });
    assert.equal(await first.locator('textarea').inputValue(), 'first draft');
    assert.equal(await second.locator('textarea').inputValue(), 'second draft');
    const firstBounds = await first.boundingBox();
    assert.ok(firstBounds);
    const secondBounds = await second.boundingBox();
    assert.ok(secondBounds);
    assert.equal(firstBounds.x, secondBounds.x + 24);
    assert.equal(firstBounds.y, secondBounds.y + 24);
    assert.equal(firstBounds.width, secondBounds.width);
    assert.equal(firstBounds.height, secondBounds.height);
    await open('Third file');
    assert.equal(await visible.count(), 2);
    const third = page.getByRole('dialog', { name: 'three.txt', exact: true });
    assert.equal(await third.getByRole('tab').count(), 2);
    await open('First file');
    assert.equal(await page.evaluate(() => window.reads), 3);
    assert.equal(await first.isVisible(), true);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addStyleTag({
      content:
        ':root{--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:#424349}',
    });
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('.scratch-tab-window')!.getBoundingClientRect().width <=
        320,
    );
    const bounds = await first.boundingBox();
    assert.ok(bounds);
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
    const bar = await first.locator('.scratch-tab-tabbar').boundingBox();
    assert.ok(bar);
    assert.ok(bar.x >= 0 && bar.x + bar.width <= 320);
    assert.ok(
      (await first.getByRole('button', { name: 'Separate window', exact: true }).boundingBox())!
        .height >= 44,
    );
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-tabs-mobile.png' });
    assert.equal(
      await first.getByRole('button', { name: 'Close tab one.txt', exact: true }).isVisible(),
      true,
    );
    assert.ok(
      (await first.getByRole('button', { name: 'Close tab three.txt', exact: true }).boundingBox())!
        .width >= 44,
    );
    // Closing an inactive tab must leave the active draft intact.
    await first.getByRole('button', { name: 'Close tab three.txt', exact: true }).click();
    assert.equal(await third.count(), 0);
    assert.equal(await first.locator('textarea').inputValue(), 'first draft');
    assert.equal(await first.getByRole('tab').count(), 1);
    // setViewportSize resolves before Chromium necessarily delivers its resize event.
    // Wait for the viewport resize before opening the next file.
    await page.evaluate(() => {
      window.desktopResize = new Promise(resolve => {
        window.addEventListener('resize', () => requestAnimationFrame(() => resolve()), {
          once: true,
        });
      });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => window.desktopResize);
    await first.evaluate(node => {
      node.style.top = '90px';
    });
    await second.evaluate(node => {
      node.style.top = '90px';
    });
    await open('Third file');
    // A hidden dirty tab protects the whole window, without closing clean tabs first.
    page.once('dialog', dialog => dialog.dismiss());
    await third.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await third.isVisible(), true);
    assert.equal(await third.getByRole('tab').count(), 2);
    await third.getByRole('tab', { name: 'one.txt', exact: false }).click();
    assert.equal(await first.locator('textarea').inputValue(), 'first draft');
    await first.getByRole('tab', { name: 'three.txt', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await third.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await first.count(), 0);
    assert.equal(await third.count(), 0);
    assert.equal(await second.isVisible(), true);
    assert.equal(await page.evaluate(() => window.drafts.size), 0);
    // The remaining single tab can also be closed with its own X.
    await second.getByRole('button', { name: 'Close tab two.txt', exact: true }).click();
    assert.equal(await visible.count(), 0);
    const savedGeometry = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('scratch-tab:window-geometry:p1')!),
    );
    assert.ok(savedGeometry.width >= 280);
    assert.ok(savedGeometry.height >= 180);
    await open('First file');
    const restoredGeometry = await visible.boundingBox();
    assert.ok(restoredGeometry);
    assert.equal(restoredGeometry.x, savedGeometry.left);
    assert.equal(restoredGeometry.y, savedGeometry.top);
    assert.equal(restoredGeometry.width, savedGeometry.width);
    assert.equal(restoredGeometry.height, savedGeometry.height);
    assert.equal(await visible.locator('textarea').inputValue(), 'first');
    await open('Third file');
    // Clean groups close together without confirmation.
    await visible.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    await page.evaluate(() => window.chatCleanup());
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
  } finally {
    await browser.close();
  }
});

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
      window.open = url => {
        window.ideUrls.push(String(url));
        return null;
      };
      activate(
        window.createRemote({
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
              if (slot === 'sidebar') window.ownerCleanup = render()!;
            },
          },
        }),
      );
      window.navigate = (chatId, projectId = 'p1') => {
        window.dispose?.();
        window.chatId = chatId;
        window.dispose = window.render(document.querySelector<HTMLElement>('#host')!, {
          chatId,
          projectId,
          cwd: `/var/lib/remote/projects/${projectId}/workspace`,
        })!;
      };
      window.navigate('a');
    });
    const open = async (path: string) => {
      await page.evaluate(path => {
        document.querySelector<HTMLAnchorElement>('#file')!.href =
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
      window.dispose!();
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
    assert.match(await page.evaluate(() => window.ideUrls.at(-1)!), /\/api\/chats\/b\/ide-open/);
    await page.getByRole('tab', { name: 'one.txt', exact: false }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.writes.length === 1);
    assert.equal(await page.evaluate(() => window.writes[0]!.projectId), 'p1');
    await page.getByRole('button', { name: 'Open with default editor', exact: true }).click();
    assert.match(await page.evaluate(() => window.ideUrls.at(-1)!), /\/api\/chats\/b\/ide-open/);
    const oldIntercepted = await page.evaluate(() => {
      const anchor = document.querySelector<HTMLAnchorElement>('#file')!;
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
      window.dispose!();
      window.ownerCleanup();
    });
    await page.waitForFunction(() => document.querySelectorAll('.scratch-tab-window').length === 0);
  } finally {
    await browser.close();
  }
});

test('window geometry is project-scoped and tolerates invalid or unavailable storage', async () => {
  const { windowGeometry } = await importFixtureModule('adapters/windowGeometry.js');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const geometry = windowGeometry('one');
    assert.equal(geometry.read(), null);
    geometry.write({ left: 120, top: 90, width: 700, height: 450 });
    assert.deepEqual(windowGeometry('one').read(), {
      left: '120px',
      top: '90px',
      width: '700px',
      height: '450px',
    });
    assert.equal(windowGeometry('two').read(), null);
    for (const invalid of ['broken JSON', 'null', '{"left":0,"top":0,"width":2,"height":2}']) {
      values.set('scratch-tab:window-geometry:one', invalid);
      assert.equal(geometry.read(), null);
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Storage blocked');
      },
    });
    assert.equal(geometry.read(), null);
    assert.doesNotThrow(() => geometry.write({ left: 0, top: 0, width: 620, height: 420 }));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

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
