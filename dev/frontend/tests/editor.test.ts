import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { importFixtureModule, installBrowserImports, runtimeModule } from './support/runtime.js';

test('editor hooks load once, normalize newlines and ignore reads after disposal', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await installBrowserImports(page);
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
      const { mountChat } = await window.importModule('/app/chat.js');
      window.reads = 0;
      window.drafts = new Map();
      window.chatCleanup = mountChat({
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
    assert.equal(
      await page.locator('textarea').evaluate((node: HTMLTextAreaElement) => node.readOnly),
      true,
    );
    await page.evaluate(() => window.finishRead('one\r\ntwo\rthree\n'));
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
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
    await page.evaluate(() => window.chatCleanup());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

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
      window.defaultEditor = null;
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
        files: {
          defaultEditorUrl({ path, projectId, line }) {
            return projectId === 'p1' && window.defaultEditor
              ? window.defaultEditor + encodeURIComponent(path) + (line ? `&line=${line}` : '')
              : null;
          },
          onDidChange(listener) {
            window.editorChanged = listener;
            return () => {
              window.editorChanged = () => {};
            };
          },
          registerOpener(open) {
            window.ideUrls = [];
            // Simulate Remote resolving a Markdown link with no other editor installed.
            queueMicrotask(() => {
              const href = open({
                projectId: 'p1',
                cwd: '/workspace',
                path: '/workspace/notes.txt',
              });
              if (!href) throw new Error('Scratch did not provide a file opener');
              document.querySelector<HTMLAnchorElement>('a')!.href = href;
              if (
                open({ projectId: 'other', cwd: '/workspace', path: '/workspace/notes.txt' }) !==
                null
              )
                throw new Error('Opener crossed project boundary');
              for (const path of ['/etc/passwd', '/workspace/../secret', '/workspace/']) {
                if (open({ projectId: 'p1', cwd: '/workspace', path }) !== null)
                  throw new Error('Opener accepted an invalid workspace file');
              }
              window.ideUrls.push(href);
            });
            return () => {};
          },
        },
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
    assert.equal(await page.evaluate(() => window.ideUrls?.length), 1);
    await page.getByText('notes', { exact: true }).click();
    assert.equal(await page.locator('.scratch-tab-choice').count(), 0);
    await page.waitForFunction(() =>
      document.querySelector<HTMLTextAreaElement>('textarea')!?.value.includes('A small file'),
    );
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-editor.png' });
    assert.equal(await page.locator('script').count(), 0);
    const defaultEditorButton = page.getByRole('button', {
      name: 'Open with default editor',
      exact: true,
    });
    assert.equal(await defaultEditorButton.count(), 0);
    await page.evaluate(() => {
      window.defaultEditor = 'https://custom-editor.test/open?file=';
      window.editorChanged();
    });
    await defaultEditorButton.waitFor();
    await page.evaluate(() => {
      window.defaultEditor = null;
      window.editorChanged();
    });
    await defaultEditorButton.waitFor({ state: 'detached' });
    await page.evaluate(() => {
      window.defaultEditor = 'https://custom-editor.test/open?file=';
      window.editorChanged();
    });
    await defaultEditorButton.waitFor();
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
      /custom-editor\.test\/open\?file=%2Fworkspace%2FREADME.md&line=3/,
    );
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.getByText('notes', { exact: true }).click();
    await page.getByRole('button', { name: 'Open with default editor' }).click();
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.match(
      await page.evaluate(() => String(window.opened[0]!)),
      /custom-editor\.test\/open\?file=%2Fworkspace%2FREADME.md&line=3/,
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
    assert.equal(await page.evaluate(() => window.originalOpens), 0);
    assert.match(await page.evaluate(() => String(window.opened[0])), /custom-editor\.test/);
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    await page.locator('#manager-file').focus();
    await page.locator('#manager-file').press('Enter');
    await page.getByRole('button', { name: 'Open with default editor' }).click();
    await page.getByRole('button', { name: 'Close window', exact: true }).click();
    assert.equal(await page.evaluate(() => window.originalOpens), 0);
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

test('highlighted editing preserves content, native undo, scrolling and phone layout', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
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
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><a id="file" href="/api/chats/a/ide-open?path=/workspace/main.js">Source file</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      const { mountChat } = await window.importModule('/app/chat.js');
      window.disk =
        'const greeting = "hello <img src=x onerror=alert(1)>";\r\n// comment\r\nconst count = 42;\r\n';
      window.chatCleanup = mountChat({
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
    const open = async (name: string) => {
      await page.evaluate(
        name =>
          (document.querySelector<HTMLAnchorElement>('#file')!.href =
            '/api/chats/a/ide-open?path=/workspace/' + name),
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
    assert.equal((await paint.textContent())!, (await input.inputValue()) + '\n');
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
        document.querySelector<HTMLElement>('.scratch-tab-window pre')!.textContent ===
        document.querySelector<HTMLTextAreaElement>('textarea')!.value + '\n',
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
        document.querySelector<HTMLElement>('pre')!.clientWidth ===
        document.querySelector<HTMLTextAreaElement>('textarea')!.clientWidth,
    );
    const mobileKeyword = await paint
      .locator('.hljs-keyword')
      .first()
      .evaluate(node => getComputedStyle(node).color);
    assert.notEqual(mobileKeyword, keyword);
    const box = await visible.boundingBox();
    assert.ok(box);
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
      () => document.querySelector<HTMLElement>('pre')!.querySelectorAll('span').length === 0,
    );
    assert.equal((await paint.textContent())!, (await input.inputValue()) + '\n');
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await paint.isVisible(), false);
    assert.notEqual(await input.evaluate(node => getComputedStyle(node).color), 'rgba(0, 0, 0, 0)');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.evaluate(() => window.chatCleanup());
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('syntax languages follow extensions and escape source markup', async () => {
  const { languageFor } = await importFixtureModule('presenters/syntax.js');
  const { highlightCode } = await importFixtureModule('vendor/syntax.js');
  for (const [name, language] of Object.entries({
    'APP.TSX': 'typescript',
    'app.jsx': 'javascript',
    'file.py': 'python',
    'main.go': 'go',
    'data.json': 'json',
    'run.sh': 'bash',
    'index.html': 'xml',
    'style.css': 'css',
    'README.md': 'markdown',
    'config.yml': 'yaml',
    'query.sql': 'sql',
    'main.rs': 'rust',
    'Main.java': 'java',
    'main.cpp': 'cpp',
    'main.c': 'cpp',
    'index.php': 'php',
  }))
    assert.equal(languageFor(name), language);
  for (const name of ['notes.txt', 'unknown.xyz', 'Makefile', '.env'])
    assert.equal(languageFor(name), null);
  const output = highlightCode(
    'const markup = "<img src=x onerror=alert(1)>"; // comment',
    'javascript',
  );
  assert.match(output, /hljs-keyword/);
  assert.match(output, /hljs-string/);
  assert.match(output, /hljs-comment/);
  assert.doesNotMatch(output, /<img/);
});

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
      window.showFile = (name: string, error?: string) => {
        window.editor?.close(true);
        const target = {
          ide: '',
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
    assert.ok(buttonBox);
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
