import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { installBrowserImports, runtimeModule } from './support/runtime.js';

test('Markdown source and preview retain unsaved edits, save exact source and fit phones', async () => {
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
      const { mountChat } = await window.importModule('/app/chat.js');
      window.disk = '# Original\r\n\r\n**bold** and *italic*\r\n';
      window.chatCleanup = mountChat({
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
    const open = async (name: string) => {
      await page.getByRole('link', { name, exact: true }).click({ force: true });
    };
    await open('Markdown file');
    const visible = page.locator('.scratch-tab-window:visible');
    const input = visible.locator('textarea');
    const preview = visible.getByRole('article', { name: 'README.md Markdown preview' });
    const showPreview = visible.getByRole('button', { name: 'Show Markdown preview', exact: true });
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
    assert.equal(await showPreview.isVisible(), true);
    await showPreview.click();
    await preview.getByRole('heading', { name: 'Original' }).waitFor();
    assert.equal(await input.isVisible(), false);
    assert.equal((await preview.locator('strong').textContent())!, 'bold');
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
      (await preview.getByRole('img', { name: 'Mermaid diagram' }).textContent())!,
      /Install/,
    );
    await preview.getByText('Unable to render Mermaid diagram.').waitFor();
    const lightDiagramId = await preview.locator('.scratch-tab-mermaid svg').getAttribute('id');
    assert.match(
      (await preview.locator('pre:not([hidden]) > code.language-mermaid').textContent())!,
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
    await page.evaluate(() => window.chatCleanup.setContext({ chatId: 'b', projectId: 'p1' }));
    assert.equal(await preview.isVisible(), true);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.cssText =
        '--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:#424349';
    });
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('.scratch-tab-window')!.getBoundingClientRect().width <=
        320,
    );
    await page.waitForFunction(previous => {
      const diagram = document.querySelector<HTMLElement>('.scratch-tab-mermaid svg')!;
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
      assert.ok(box);
      assert.ok(box.x >= 0 && box.x + box.width <= 320);
    }
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await page.screenshot({
        path: process.env.SCRATCH_TAB_SCREENSHOTS + '-markdown-mobile-dark.png',
      });
    await visible.getByRole('button', { name: 'Show Markdown source' }).click();
    assert.equal(await input.inputValue(), edited);
    assert.equal(await input.isVisible(), true);
    await page.evaluate(() => window.chatCleanup());
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Markdown defaults to preview and remembers both choices across files and reloads', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({ contentType: 'text/javascript', body: await runtimeModule(path) });
      return route.fulfill({
        contentType: 'text/html',
        body: '<a id="file" href="/api/chats/a/ide-open?path=/workspace/one.md">File</a>',
      });
    });
    const mount = async () => {
      await page.goto('https://remote.test/');
      await page.addStyleTag({
        content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
      });
      await page.evaluate(async () => {
        const { mountChat } = await window.importModule('/app/chat.js');
        window.chatCleanup = mountChat({
          context: { chatId: 'a', projectId: 'p1' },
          drafts: new Map(),
          launchIde: () => {},
          files: {
            async read() {
              return { content: '# Remembered', revision: 'initial' };
            },
            async save() {
              return { revision: 'saved' };
            },
          },
        });
      });
    };
    const open = async (name: string) => {
      await page.locator('#file').evaluate((node: HTMLAnchorElement, name: string) => {
        node.href = '/api/chats/a/ide-open?path=/workspace/' + name;
      }, name);
      await page.getByRole('link', { name: 'File', exact: true }).click({ force: true });
      await page.waitForFunction(() =>
        [...document.querySelectorAll<HTMLElement>('.scratch-tab-window')].some(
          node =>
            node.style.display !== 'none' && node.querySelector('textarea')?.readOnly === false,
        ),
      );
    };
    const visible = page.locator('.scratch-tab-window:visible');
    await mount();
    await open('one.md');
    await visible.getByRole('heading', { name: 'Remembered' }).waitFor();
    assert.equal(await page.locator('.scratch-tab-choice').count(), 0);
    await visible.getByRole('button', { name: 'Show Markdown source' }).click();
    await open('two.markdown');
    assert.equal(await visible.locator('textarea').isVisible(), true);
    await page.evaluate(() => window.chatCleanup());
    await mount();
    await open('three.md');
    assert.equal(await visible.locator('textarea').isVisible(), true);
    await visible.getByRole('button', { name: 'Show Markdown preview' }).click();
    await page.evaluate(() => window.chatCleanup());
    await mount();
    await open('four.md');
    await visible.getByRole('heading', { name: 'Remembered' }).waitFor();
    await open('plain.txt');
    assert.equal(await visible.locator('textarea').isVisible(), true);
    assert.equal(await visible.getByRole('button', { name: 'Show Markdown source' }).count(), 0);
    await page.evaluate(() => window.chatCleanup());
    await page.addInitScript(() =>
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('Storage blocked');
        },
      }),
    );
    await mount();
    await open('blocked.md');
    await visible.getByRole('heading', { name: 'Remembered' }).waitFor();
    await visible.getByRole('button', { name: 'Show Markdown source' }).click();
    await open('blocked-two.md');
    assert.equal(await visible.locator('textarea').isVisible(), true);
    await page.evaluate(() => window.chatCleanup());
  } finally {
    await browser.close();
  }
});

test('Markdown preview renders safely and resolves workspace resources', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill(
        path.endsWith('.js')
          ? { contentType: 'text/javascript', body: await runtimeModule(path) }
          : { contentType: 'text/html', body: '' },
      );
    });
    await page.goto('https://remote.test/');
    const { html, escaped, sanitized } = await page.evaluate(async () => {
      const { markdownPreview } = await window.importModule('/presenters/markdown.js');
      const target = {
        path: '/workspace/docs/README.MD',
        download: '/api/chats/a/files/download?path=docs%2FREADME.MD',
      };
      return {
        html: markdownPreview(
          '# Heading\n\n**bold** and *italic*\n\n- item\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n[guide](guide.md) ![icon](images/icon.png)\n\n[bad](javascript:alert(1))\n\n<script>alert(1)</script>',
          target,
        ),
        escaped: markdownPreview(
          '![bad](data:image/png;base64,AAAA) [outside](../../etc/passwd)',
          target,
        ),
        sanitized: markdownPreview(
          `<h2 align="center" onclick="window.bad=true">Safe HTML</h2>
<a href="guide.md" target="_top">Guide</a><img src="images/icon.png" alt="Workspace icon" onerror="window.bad=true">
<a href="https://example.com/">External</a><img src="https://example.com/logo.png" alt="External logo" width="300">
<a href="mailto:hello@example.com">Email</a><a href="#quick-start">Install</a>
<a href="jav&#x61;script:window.bad=true">Script link</a><a href="java&#10;script:window.bad=true">Obfuscated link</a>
<a href="//evil.test/">Protocol relative</a><a href="file:///etc/passwd">File</a><a href="../../etc/passwd">Outside</a>
<a href="%2e%2e/%2e%2e/etc/passwd">Encoded outside</a><a href="%00secret">Null path</a>
<img src="data:image/svg+xml,%3Csvg%20onload=alert(1)%3E" alt="Blocked data"><img src="//evil.test/x" alt="Blocked remote">
<img src="../../etc/passwd" alt="Blocked outside"><img src="x" srcset="https://evil.test/x 2x" style="position:fixed;inset:0">
<script>window.bad=true</script><iframe srcdoc="<script>window.bad=true</script>"></iframe>
<style>body{display:none}</style><link rel="stylesheet" href="https://evil.test/x"><base href="https://evil.test/">
<form action="https://evil.test/"><input autofocus onfocus="window.bad=true"><button>Submit</button></form>
<svg onload="window.bad=true"><a href="javascript:window.bad=true">SVG</a></svg><math><mtext>Math</mtext></math>
<p id="scratch-tab-window" class="scratch-tab-window" data-test="injected" style="position:fixed">Text</p>

| Left | Right |
| :--- | ---: |
| one | two |`,
          target,
        ),
      };
    });
    assert.match(html, /<h1>Heading<\/h1>/);
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<em>italic<\/em>/);
    assert.match(html, /<table>/);
    assert.match(html, /<code class="language-js">/);
    assert.match(html, /href="\/api\/chats\/a\/ide-open\?path=%2Fworkspace%2Fdocs%2Fguide.md"/);
    assert.match(html, /src="\/api\/chats\/a\/files\/download\?path=docs%2Fimages%2Ficon.png"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.doesNotMatch(html, /<script|href="javascript:/i);
    assert.doesNotMatch(escaped, /<img|href="\/api/);
    await page.route('https://example.com/**', route =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      }),
    );
    await page.setContent(sanitized);
    assert.equal(await page.getByRole('heading', { name: 'Safe HTML' }).count(), 1);
    assert.equal(
      await page.getByRole('heading', { name: 'Safe HTML' }).getAttribute('align'),
      'center',
    );
    assert.equal(
      await page.getByRole('link', { name: 'Guide', exact: true }).getAttribute('href'),
      '/api/chats/a/ide-open?path=%2Fworkspace%2Fdocs%2Fguide.md',
    );
    assert.equal(
      await page.getByRole('link', { name: 'Guide', exact: true }).getAttribute('target'),
      '_blank',
    );
    assert.equal(
      await page.getByRole('link', { name: 'External', exact: true }).getAttribute('rel'),
      'noopener noreferrer',
    );
    assert.equal(
      await page.getByRole('img', { name: 'Workspace icon' }).getAttribute('src'),
      '/api/chats/a/files/download?path=docs%2Fimages%2Ficon.png',
    );
    assert.equal(
      await page.getByRole('img', { name: 'External logo' }).getAttribute('src'),
      'https://example.com/logo.png',
    );
    assert.equal(
      await page.getByRole('img', { name: 'External logo' }).getAttribute('loading'),
      'lazy',
    );
    assert.equal(
      await page.getByRole('img', { name: 'External logo' }).getAttribute('referrerpolicy'),
      'no-referrer',
    );
    assert.equal(
      await page.getByRole('link', { name: 'Email', exact: true }).getAttribute('href'),
      'mailto:hello@example.com',
    );
    assert.equal(
      await page.getByRole('link', { name: 'Install', exact: true }).getAttribute('href'),
      '#quick-start',
    );
    for (const name of [
      'Script link',
      'Obfuscated link',
      'Protocol relative',
      'File',
      'Outside',
      'Encoded outside',
      'Null path',
    ]) {
      assert.equal(await page.getByRole('link', { name, exact: true }).getAttribute('href'), '#');
    }
    assert.equal(
      await page
        .locator(
          'script,iframe,style,link,base,form,input,button,svg,math,[onclick],[onerror],[onfocus],[onload],[srcset],[style],[data-test],#scratch-tab-window,.scratch-tab-window',
        )
        .count(),
      0,
    );
    assert.equal(await page.getByRole('img', { name: /^Blocked/ }).count(), 0);
    assert.match((await page.locator('body').textContent())!, /Blocked data/);
    assert.match(
      await page
        .locator('th')
        .first()
        .evaluate(node => getComputedStyle(node).textAlign),
      /^(?:-webkit-)?left$/,
    );
    assert.match(
      await page
        .locator('th')
        .last()
        .evaluate(node => getComputedStyle(node).textAlign),
      /^(?:-webkit-)?right$/,
    );
    assert.equal(await page.evaluate(() => window.bad), undefined);
  } finally {
    await browser.close();
  }
});

test('production preview renders README HTML, preserves alignment and saves exact source', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const source = `<p align="center"> <a href="https://remote.futrx.com/"> <img src="docs.remote.futrx.com/static/brand/remote-futrx-on-dark.png" alt="Remote by FutrX" width="300"> </a> </p>

<h1 align="center">Give every AI project its own computer.</h1>

<p align="center"> Run Codex, MiniMax, Claude Code, Kimi, and Antigravity in separate, always-on Linux workspaces on your own server. Use everything from one browser: chat, terminal, files, Git, live previews, and a shared browser. </p>

<p align="center"> <a href="https://remote.futrx.com/"><strong>Website</strong></a> · <a href="https://docs.remote.futrx.com/"><strong>Documentation</strong></a> · <a href="#quick-start"><strong>Install</strong></a> · <a href="https://github.com/futrx-com/remote.futrx/issues"><strong>Roadmap</strong></a> </p>

Inline <em>HTML</em> and **Markdown**.

<details><summary>Quick start</summary><p>Install Remote.</p></details>

\`<b>inline source</b>\`

\`\`\`html
<img src=x onerror=alert(1)>
\`\`\``;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js'))
        return route.fulfill({ contentType: 'text/javascript', body: await runtimeModule(path) });
      if (path.endsWith('/files/download'))
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"/>',
        });
      return route.fulfill({
        contentType: 'text/html',
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><a href="/api/chats/a/ide-open?path=/workspace/README.md">README</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async content => {
      const { default: activate } = await window.importModule('/main.js');
      activate(
        window.createRemote({
          slots: { chatHeaderActions: 'chat', sidebarHeaderActions: 'sidebar' },
          backend: {
            async call(_path, options) {
              if (options.body.save) {
                window.saved = options.body.content;
                return { revision: 'saved' };
              }
              return { content, revision: 'initial' };
            },
          },
          ui: {
            register(slot, mount) {
              if (slot === 'sidebar') window.dispose = mount()!;
              if (slot === 'chat') mount(document.body, { chatId: 'a', projectId: 'p1' })!;
            },
          },
        }),
      );
    }, source);
    await page.getByRole('link', { name: 'README', exact: true }).click();
    const preview = page.getByRole('article', { name: 'README.md Markdown preview' });
    const heading = preview.getByRole('heading', {
      name: 'Give every AI project its own computer.',
    });
    await heading.waitFor({ timeout: 5000 });
    assert.equal(await heading.evaluate(node => getComputedStyle(node).textAlign), 'center');
    const logo = preview.getByRole('img', { name: 'Remote by FutrX' });
    assert.equal(await logo.getAttribute('width'), '300');
    assert.equal(
      await logo.getAttribute('src'),
      '/api/chats/a/files/download?path=docs.remote.futrx.com%2Fstatic%2Fbrand%2Fremote-futrx-on-dark.png',
    );
    assert.match(
      await logo.evaluate(node => getComputedStyle(node.parentElement!.parentElement!).textAlign),
      /^(?:-webkit-)?center$/,
    );
    assert.equal(
      await preview.getByRole('link', { name: 'Website', exact: true }).getAttribute('target'),
      '_blank',
    );
    assert.equal(
      await preview.getByRole('link', { name: 'Website', exact: true }).getAttribute('rel'),
      'noopener noreferrer',
    );
    assert.equal(
      await preview.getByRole('link', { name: 'Install', exact: true }).getAttribute('href'),
      '#quick-start',
    );
    await preview.locator('summary').click();
    assert.equal(await preview.getByText('Install Remote.', { exact: true }).isVisible(), true);
    assert.equal(await preview.locator('em').textContent(), 'HTML');
    assert.equal(await preview.locator('code').first().textContent(), '<b>inline source</b>');
    assert.equal(await preview.locator('code img').count(), 0);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForFunction(
      () => document.querySelector('.scratch-tab-window')!.getBoundingClientRect().width <= 320,
    );
    assert.equal(await preview.evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await page.getByRole('button', { name: 'Show Markdown source' }).click();
    assert.equal(await page.locator('textarea').inputValue(), source);
    await page.locator('textarea').fill(source + '\nEdited.');
    await page.getByRole('button', { name: 'Show Markdown preview' }).click();
    await heading.waitFor();
    await preview.getByText('Edited.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.saved?.endsWith('\nEdited.'));
    assert.equal(await page.evaluate(() => window.saved), source + '\nEdited.');
    await page.evaluate(() => window.dispose!());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Mermaid preview renders installer flowcharts, retains source and handles invalid diagrams', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    const errors: string[] = [];
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
      activate(
        window.createRemote({
          slots: { chatHeaderActions: 'chat', sidebarHeaderActions: 'sidebar' },
          backend: {
            async call() {
              return { content: text, revision: 'initial' };
            },
          },
          ui: {
            register(slot, mount) {
              if (slot === 'sidebar') window.dispose = mount()!;
              if (slot === 'chat') mount(document.body, { chatId: 'a', projectId: 'p1' })!;
            },
          },
        }),
      );
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
    assert.ok(bounds);
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
      (await preview.locator('pre:not([hidden]) > code.language-mermaid').textContent())!,
      /A\[broken/,
    );
    await page.evaluate(() => window.dispose!());
    assert.equal(await page.locator('.scratch-tab-markdown').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('production bundle renders Mermaid diagrams after an invalid block and disposes cleanly', async () => {
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
        body: '<a href="/api/chats/a/ide-open?path=/workspace/diagram.md">Diagram</a>',
      });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    await page.evaluate(async () => {
      localStorage.setItem('scratch-tab:markdown-view', 'source');
      const { default: activate } = await window.importModule('/main.js');
      activate(
        window.createRemote({
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
              if (slot === 'sidebar') window.dispose = mount()!;
              if (slot === 'chat') mount(document.body, { chatId: 'a', projectId: 'p1' })!;
            },
          },
        }),
      );
    });
    await page.getByRole('link', { name: 'Diagram', exact: true }).click();
    const toggle = page.getByRole('button', { name: 'Show Markdown preview', exact: true });
    await page.waitForFunction(
      () => document.querySelector<HTMLTextAreaElement>('textarea')!?.readOnly === false,
    );
    await toggle.click();
    await page.getByText('Unable to render Mermaid diagram.').waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll('.scratch-tab-mermaid svg').length === 2,
    );
    assert.match((await page.getByRole('article').textContent())!, /Install/);
    assert.match((await page.locator('.scratch-tab-mermaid').last().textContent())!, /Alice/);
    const ids = await page
      .locator('.scratch-tab-mermaid svg')
      .evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(new Set(ids).size, 2);
    await page.getByRole('button', { name: 'Show Markdown source' }).click();
    await toggle.click();
    // Closing during async rendering must not restore content or leak staging elements.
    await page.evaluate(() => window.dispose!());
    await page.waitForFunction(() => !document.querySelector('[id^="scratch-mermaid-"]'));
    assert.equal(await page.locator('.scratch-tab-window').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
