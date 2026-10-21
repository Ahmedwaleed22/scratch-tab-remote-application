import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { installBrowserImports, runtimeModule } from './support/runtime.js';

const MISSING = 'File not found. It may have been deleted or moved.';

// Serves links to workspace files and mounts a chat whose disk and listings share one fake workspace.
async function mountWorkspace(page: Page, links: string[], workspace: Record<string, string>) {
  await installBrowserImports(page);
  await page.route('https://remote.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('.js'))
      return route.fulfill({ contentType: 'text/javascript', body: await runtimeModule(path) });
    return route.fulfill({
      contentType: 'text/html',
      body: links
        .map(file => `<a href="/api/chats/a/ide-open?path=/workspace/${file}">Open ${file}</a>`)
        .join(''),
    });
  });
  await page.goto('https://remote.test/');
  await page.addStyleTag({
    content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
  });
  await page.evaluate(
    async ({ workspace, missing }) => {
      const { mountChat } = await window.importModule('/app/chat.js');
      window.workspace = workspace;
      window.listings = [];
      window.creates = [];
      window.drafts = new Map();
      window.chatCleanup = mountChat({
        context: { chatId: 'a', projectId: 'p1' },
        drafts: window.drafts,
        launchIde: () => {},
        directories: {
          async list(chatId, relative) {
            window.listings.push(`${chatId}:${relative}`);
            await new Promise(resolve => setTimeout(resolve, 80));
            const prefix = relative ? relative + '/' : '';
            const entries = new Map<string, boolean>();
            for (const file of Object.keys(window.workspace)) {
              if (!file.startsWith(prefix)) continue;
              const [name, ...rest] = file.slice(prefix.length).split('/');
              entries.set(name!, rest.length > 0 || entries.get(name!) === true);
            }
            if (relative && !entries.size) throw new Error('folder not found');
            return [...entries].map(([name, isDir]) => ({ name, path: prefix + name, isDir }));
          },
        },
        files: {
          async read(path) {
            const content = window.workspace[path.slice('/workspace/'.length)];
            if (content === undefined) throw new Error(missing);
            return { content, revision: content };
          },
          async save(path, content, revision, create) {
            const relative = path.slice('/workspace/'.length);
            const current = window.workspace[relative];
            if (create) {
              if (current !== undefined) throw new Error('A file already exists at this path.');
              window.creates.push(relative);
            } else if (current === undefined) throw new Error(missing);
            else if (current !== revision) throw new Error('File changed on disk.');
            window.workspace[relative] = content;
            return { revision: content };
          },
        },
      });
    },
    { workspace, missing: MISSING },
  );
}

test('file sidebar browses the workspace, opens files as tabs and remembers its visibility', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await mountWorkspace(page, ['src/app.ts'], {
      'README.md': '# Readme',
      'src/app.ts': 'export {};',
      'src/lib/util.ts': 'export const util = 1;',
      'image.png': 'binary',
      'package-lock.json': '{}',
    });
    await page.getByRole('link', { name: 'Open src/app.ts' }).click();
    const visible = page.locator('.scratch-tab-window:visible');
    const files = visible.getByRole('navigation', { name: 'Workspace files' });
    // The sidebar starts closed and lists nothing until it is opened.
    assert.equal(await files.isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.listings), []);
    await visible.getByRole('button', { name: 'Show files' }).click();
    await files.getByRole('button', { name: 'src', exact: true }).waitFor();
    // The opened file's folders are revealed and the file is highlighted.
    assert.equal(
      await files.getByRole('button', { name: 'src', exact: true }).getAttribute('aria-expanded'),
      'true',
    );
    assert.equal(
      await files.getByRole('button', { name: 'app.ts' }).getAttribute('aria-current'),
      'page',
    );
    assert.deepEqual(await files.locator('.scratch-tab-tree-name').allInnerTexts(), [
      'src',
      'lib',
      'app.ts',
      'image.png',
      'package-lock.json',
      'README.md',
    ]);
    assert.equal(
      await files.getByRole('link', { name: 'image.png' }).getAttribute('href'),
      '/api/chats/a/files/download?path=image.png',
    );
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-sidebar.png' });

    await files.getByRole('button', { name: 'package-lock.json' }).click();
    // Tabs show a file-type icon beside the name, like an editor tab strip.
    assert.equal(
      await visible.getByRole('tab', { name: 'app.ts' }).locator('svg text').textContent(),
      'TS',
    );
    assert.equal(
      await visible
        .getByRole('tab', { name: 'package-lock.json' })
        .locator('svg path')
        .getAttribute('stroke'),
      '#8cc84b',
    );
    await page.addStyleTag({
      content:
        ':root{--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:#424349}',
    });
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await visible.locator('.scratch-tab-tabbar').screenshot({
        path: process.env.SCRATCH_TAB_SCREENSHOTS + '-tab-icons.png',
      });
    await visible.getByRole('button', { name: 'Close tab package-lock.json' }).click();
    await files.getByRole('button', { name: 'README.md' }).click();
    assert.equal(await visible.count(), 1);
    assert.equal(await visible.getByRole('tab').count(), 2);
    assert.equal(
      await visible.getByRole('tab', { selected: true }).getAttribute('data-path'),
      '/workspace/README.md',
    );
    await files.getByRole('button', { name: 'lib', exact: true }).click();
    await files.getByRole('button', { name: 'util.ts' }).click();
    assert.equal(await visible.getByRole('tab').count(), 3);
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLTextAreaElement>(
          '.scratch-tab-window:not([style*="none"]) textarea',
        )?.value === 'export const util = 1;',
    );
    // Selecting an open file switches to its tab instead of opening it again.
    await files.getByRole('button', { name: 'app.ts' }).click();
    assert.equal(await visible.getByRole('tab').count(), 3);
    assert.equal(
      await visible.getByRole('tab', { selected: true }).getAttribute('data-path'),
      '/workspace/src/app.ts',
    );

    await files.getByRole('button', { name: 'src', exact: true }).click();
    assert.equal(await files.getByRole('button', { name: 'app.ts' }).count(), 0);
    await page.evaluate(() => {
      window.workspace['notes.txt'] = 'new';
    });
    await files.getByRole('button', { name: 'Refresh files' }).click();
    await files.getByRole('button', { name: 'notes.txt' }).waitFor();

    await visible.getByRole('button', { name: 'Hide files' }).click();
    assert.equal(await files.isVisible(), false);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('scratch-tab:file-sidebar')),
      'closed',
    );
    assert.equal(
      await visible.getByRole('button', { name: 'Show files' }).getAttribute('aria-expanded'),
      'false',
    );
    await visible.getByRole('button', { name: 'Show files' }).click();
    assert.equal(await files.isVisible(), true);

    // Phones show the tree as a drawer that starts closed and closes after picking a file.
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForFunction(() => !document.querySelector('.scratch-tab-sidebar:not([hidden])'));
    await visible.getByRole('button', { name: 'Show files' }).click();
    const drawer = await files.boundingBox();
    assert.ok(drawer && drawer.width <= 300);
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-sidebar-mobile.png' });
    await files.getByRole('button', { name: 'notes.txt' }).click();
    assert.equal(await files.isVisible(), false);
    assert.equal(await visible.getByRole('tab').count(), 4);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('scratch-tab:file-sidebar')),
      'open',
    );
  } finally {
    await browser.close();
  }
});

test('deleted files show a clear not-found state and edits can recreate them', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await mountWorkspace(page, ['readme.txt', 'gone.txt'], { 'notes/readme.txt': 'moved' });
    await page.getByRole('link', { name: 'Open readme.txt' }).click();
    const visible = page.locator('.scratch-tab-window:visible');
    await visible.getByRole('heading', { name: 'File not found' }).waitFor();
    assert.match(await visible.getByRole('status').first().innerText(), /\/workspace\/readme\.txt/);
    assert.equal(await visible.getByRole('button', { name: 'Save' }).count(), 0);
    assert.equal(
      await visible
        .getByRole('button', { name: 'Try again' })
        .evaluate(node => node === document.activeElement),
      true,
    );
    // The listing refreshes so the sidebar no longer offers the deleted file.
    await visible.getByRole('button', { name: 'Show files' }).click();
    await visible.getByRole('button', { name: 'notes', exact: true }).waitFor();
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-not-found.png' });

    await page.evaluate(() => {
      window.workspace['readme.txt'] = 'restored';
    });
    await visible.getByRole('button', { name: 'Try again' }).click();
    const textarea = visible.locator('textarea');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLTextAreaElement>('.scratch-tab-window textarea')?.value ===
        'restored',
    );
    assert.equal(await visible.getByRole('heading', { name: 'File not found' }).count(), 0);

    // Deleted while editing: saving reports it and keeps the text for recreating.
    await page.evaluate(() => {
      delete window.workspace['readme.txt'];
    });
    await textarea.fill('restored and edited');
    await visible.getByRole('button', { name: 'Save', exact: true }).click();
    const alert = visible.getByRole('alert');
    await alert.waitFor();
    assert.match(await alert.innerText(), /deleted or moved/);
    assert.equal(await textarea.inputValue(), 'restored and edited');
    assert.match(await visible.locator('footer').innerText(), /File was deleted on disk/);
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-deleted.png' });
    await visible.getByRole('button', { name: 'Recreate', exact: true }).click();
    await page.waitForFunction(() => window.workspace['readme.txt'] === 'restored and edited');
    assert.deepEqual(await page.evaluate(() => window.creates), ['readme.txt']);
    await alert.waitFor({ state: 'detached' });
    assert.equal(await visible.locator('footer').innerText(), 'Recreated · UTF-8');
    assert.equal(
      await visible.getByRole('button', { name: 'Save', exact: true }).isDisabled(),
      true,
    );
    await visible.getByRole('button', { name: 'readme.txt', exact: true }).waitFor();

    // A missing file with no draft can be closed on its own.
    await page.getByRole('link', { name: 'Open gone.txt' }).click({ force: true });
    await visible.getByRole('heading', { name: 'File not found' }).waitFor();
    assert.equal(await visible.getByRole('tab').count(), 2);
    await visible.getByRole('button', { name: 'Close tab', exact: true }).click();
    assert.equal(await visible.getByRole('tab').count(), 1);
    assert.equal(await textarea.inputValue(), 'restored and edited');
  } finally {
    await browser.close();
  }
});

test('a remembered draft of a deleted file reopens ready to recreate', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await mountWorkspace(page, ['draft.txt'], { 'draft.txt': 'disk' });
    await page.getByRole('link', { name: 'Open draft.txt' }).click();
    const visible = page.locator('.scratch-tab-window:visible');
    await visible.locator('textarea').fill('unsaved');
    // Leaving the project keeps the draft; the file is deleted meanwhile.
    await page.evaluate(() => {
      window.chatCleanup();
      delete window.workspace['draft.txt'];
    });
    await page.evaluate(async () => {
      const { mountChat } = await window.importModule('/app/chat.js');
      window.chatCleanup = mountChat({
        context: { chatId: 'a', projectId: 'p1' },
        drafts: window.drafts,
        launchIde: () => {},
        directories: { list: async () => [] },
        files: {
          read: async () => {
            throw new Error('File not found. It may have been deleted or moved.');
          },
          save: async (path, content, _revision, create) => {
            window.savedPath = `${create ? 'create' : 'save'}:${path}`;
            window.saved = content;
            return { revision: 'new' };
          },
        },
      });
    });
    await page.getByRole('link', { name: 'Open draft.txt' }).click();
    await visible.getByRole('alert').waitFor();
    assert.equal(await visible.locator('textarea').inputValue(), 'unsaved');
    await visible.getByRole('button', { name: 'Recreate', exact: true }).click();
    await page.waitForFunction(() => window.saved === 'unsaved');
    assert.equal(await page.evaluate(() => window.savedPath), 'create:/workspace/draft.txt');
  } finally {
    await browser.close();
  }
});

test('tabs reveal nested files without scrollbars and refresh reports progress and errors', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const workspace: Record<string, string> = {
      'top.txt': 'top',
      'z-folder/deep/target.txt': 'target',
    };
    for (let index = 0; index < 60; index++) workspace[`folder-${index}/note.txt`] = 'note';
    await mountWorkspace(page, ['top.txt', 'z-folder/deep/target.txt'], workspace);
    await page.getByRole('link', { name: 'Open top.txt', exact: true }).click();
    const panel = page.locator('.scratch-tab-window:visible');
    await panel.getByRole('button', { name: 'Show files' }).click();
    const files = panel.getByRole('navigation', { name: 'Workspace files' });
    await files.getByRole('button', { name: 'top.txt', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Open z-folder/deep/target.txt' }).click({ force: true });
    const target = files.getByRole('button', { name: 'target.txt', exact: true });
    await target.waitFor();
    await panel.getByRole('tab', { name: 'top.txt', exact: true }).click();
    await files.getByRole('button', { name: 'z-folder', exact: true }).click();
    await panel.getByRole('tab', { name: 'target.txt', exact: true }).click();
    await target.waitFor();
    assert.equal(await target.getAttribute('aria-current'), 'page');
    const inView = await target.evaluate(node => {
      const row = node.getBoundingClientRect();
      const tree = node.closest('.scratch-tab-tree')!.getBoundingClientRect();
      return row.top >= tree.top && row.bottom <= tree.bottom;
    });
    assert.equal(inView, true);
    // Selecting the current tab also reveals a parent the user collapsed.
    await files.getByRole('button', { name: 'deep', exact: true }).click();
    await panel.getByRole('tab', { name: 'target.txt', exact: true }).click();
    await target.waitFor();
    assert.equal(await target.getAttribute('aria-current'), 'page');
    for (const selector of ['.scratch-tab-tree', '.scratch-tab-tabs']) {
      assert.equal(
        await panel.locator(selector).evaluate(node => getComputedStyle(node).scrollbarWidth),
        'none',
      );
    }
    const tree = files.locator('.scratch-tab-tree');
    await tree.hover();
    await page.mouse.wheel(0, -10000);
    await page.waitForFunction(() => document.querySelector('.scratch-tab-tree')?.scrollTop === 0);
    const refresh = files.getByRole('button', { name: 'Refresh files' });
    await refresh.click();
    await files.getByRole('status').getByText('Refreshing…', { exact: true }).waitFor();
    assert.equal(await refresh.isDisabled(), true);
    await files.getByRole('status').getByText('Files refreshed.', { exact: true }).waitFor();
    await page.evaluate(() => {
      delete window.workspace['z-folder/deep/target.txt'];
    });
    await refresh.click();
    await files
      .getByRole('status')
      .getByText('Refresh failed. Try again.', { exact: true })
      .waitFor();
    assert.equal(await refresh.isEnabled(), true);
  } finally {
    await browser.close();
  }
});
