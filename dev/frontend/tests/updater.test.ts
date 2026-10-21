import { test } from 'vitest';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installBrowserImports, runtimeModule } from './support/runtime.js';

test('GitHub updater checks versions, protects drafts, uploads, and reports partial failures', async () => {
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
      return route.fulfill({ contentType: 'text/html', body: '<div id="updates"></div>' });
    });
    await page.goto('https://remote.test/');
    await page.evaluate(async () => {
      const { mountUpdates } = await window.importModule('/app/updates.js');
      const { isNewer } = await window.importModule('/services/releaseVersion.js');
      window.comparisons = [
        isNewer('0.10.0', '0.9.0'),
        isNewer('0.3.2', '0.4.0'),
        isNewer('0.4.0-beta', '0.3.2'),
        isNewer('0.4.0', '0.4.0'),
      ];
      window.uploads = 0;
      window.reloads = 0;
      window.drafts = new Map();
      window.partial = false;
      window.denied = false;
      window.badDownload = false;
      const remote: RemoteTestFixture = {
        application: { version: '0.3.2' },
        backend: {
          async call() {
            return { version: '0.4.0' };
          },
          async fetch() {
            if (window.draftDuringDownload)
              window.drafts.set('new', {
                content: 'new edit',
                revision: '',
                baseline: '',
                crlf: false,
              });
            return window.badDownload
              ? new Response(JSON.stringify({ error: 'Checksum mismatch' }), { status: 502 })
              : new Response('verified zip', { headers: { 'Content-Type': 'application/zip' } });
          },
        },
      };
      window.fetch = async (url, options = {}) => {
        if (window.denied) return new Response('{}', { status: 403 });
        if (options.method === 'POST') {
          window.uploads++;
          if (!(options.body instanceof FormData)) throw new Error('Expected upload FormData');
          const zip = options.body.get('package');
          if (!(zip instanceof File)) throw new Error('Expected package file');
          window.archiveName = zip.name;
          return new Response(
            JSON.stringify({
              id: 'scratch-tab',
              version: '0.4.0',
              upgraded: window.partial ? [{ error: 'container unavailable' }] : [],
            }),
          );
        }
        return new Response(JSON.stringify([{ id: 'scratch-tab', version: '0.3.2' }]));
      };
      window.remount = () => {
        window.cleanup?.();
        window.cleanup = mountUpdates(document.querySelector<HTMLElement>('#updates')!, {
          remote: window.createRemote(remote),
          projectId: 'p1',
          drafts: window.drafts,
          reload: () => window.reloads++,
        });
      };
      window.remount();
    });
    assert.deepEqual(await page.evaluate(() => window.comparisons), [true, false, false, false]);
    await page.getByText('Version 0.4.0 is available', { exact: false }).waitFor();
    await page.evaluate(() =>
      window.drafts.set('a', { content: 'unsaved', revision: '', baseline: '', crlf: false }),
    );
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page
      .getByText('Save or discard all Scratch Tab drafts in this tab before updating.', {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.evaluate(() => window.uploads), 0);
    await page.evaluate(() => {
      window.drafts.clear();
      window.badDownload = true;
    });
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page.getByText('Checksum mismatch', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.reloads), 0);
    await page.evaluate(() => {
      window.badDownload = false;
      window.draftDuringDownload = true;
    });
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page
      .getByText('A Scratch Tab draft was created during download. Save it before updating.', {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.evaluate(() => window.uploads), 0);
    await page.evaluate(() => {
      window.draftDuringDownload = false;
      window.drafts.clear();
      window.partial = true;
    });
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page
      .getByText('Package updated, but 1 project upgrade(s) failed.', { exact: false })
      .waitFor();
    assert.equal(await page.evaluate(() => window.reloads), 0);
    assert.equal(await page.evaluate(() => window.archiveName), 'scratch-tab-0.4.0.zip');
    await page.evaluate(() => {
      window.partial = false;
      window.remount();
    });
    await page.getByText('Version 0.4.0 is available', { exact: false }).waitFor();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page.waitForFunction(() => window.reloads === 1);
    await page.evaluate(() => {
      window.denied = true;
      window.remount();
    });
    await page.getByText('Only administrators can update Scratch Tab.', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Update', exact: true }).isVisible(),
      false,
    );
    await page.evaluate(() => window.cleanup());
    assert.equal(await page.locator('.scratch-tab-updates').count(), 0);
  } finally {
    await browser.close();
  }
});

test('updater belongs only to Scratch Tab card and closes with its owner', async () => {
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
        body: '<div id="card"></div><div id="other"></div>',
      });
    });
    await page.goto('https://remote.test/');
    await page.evaluate(async () => {
      const { default: activate } = await window.importModule('/main.js');
      window.slots = [];
      window.projects = [];
      window.fetch = async () =>
        new Response(JSON.stringify([{ id: 'scratch-tab', version: '0.4.1' }]));
      activate(
        window.createRemote({
          application: { id: 'scratch-tab', version: '0.4.1' },
          slots: {
            applicationCardActions: 'card',
            chatHeaderActions: 'chat',
            sidebarHeaderActions: 'sidebar',
          },
          backend: {
            async call(path, options) {
              window.projects.push(options.projectId);
              return { version: '0.4.2' };
            },
          },
          ui: {
            register(slot, render, options) {
              window.slots.push(slot);
              if (slot !== 'card') return;
              for (const [id, app] of [
                ['card', 'scratch-tab'],
                ['other', 'redis'],
              ]) {
                const context = { projectId: 'p1', instance: { applicationId: app! } };
                if (options!.when(context))
                  window.cardCleanup = render(document.getElementById(id!)!, context)!;
              }
            },
            openPopup(options) {
              const body = document.createElement('div');
              body.id = 'popup';
              document.body.append(body);
              const cleanup = options.mount(body)!;
              return {
                close() {
                  cleanup?.();
                  body.remove();
                },
              };
            },
          },
        }),
      );
    });
    assert.deepEqual(await page.evaluate(() => window.slots), ['card', 'sidebar', 'chat']);
    assert.equal(await page.locator('#other button').count(), 0);
    await page.getByRole('button', { name: 'Updates', exact: true }).click();
    await page.getByText('Version 0.4.2 is available', { exact: false }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.projects), ['p1']);
    assert.equal(await page.getByRole('button', { name: 'Update', exact: true }).isVisible(), true);
    await page.evaluate(() => window.cardCleanup());
    assert.equal(await page.locator('#popup').count(), 0);
    assert.equal(await page.locator('#card button').count(), 0);
  } finally {
    await browser.close();
  }
});

test('updater shares installation ownership across popups and releases it after cancellation', async () => {
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
        body: '<div id="first"></div><div id="second"></div>',
      });
    });
    await page.goto('https://remote.test/');
    await page.evaluate(async () => {
      const { mountUpdates } = await window.importModule('/app/updates.js');
      window.downloads = 0;
      window.uploads = 0;
      window.reloads = 0;
      const remote: RemoteTestFixture = {
        application: { version: '1.0.0' },
        backend: {
          async call() {
            return { version: '1.1.0' };
          },
          async fetch(_path, options) {
            window.downloads++;
            if (window.downloads === 1) {
              window.firstSignal = options.signal!;
              return new Promise(resolve => {
                window.finishDownload = () => resolve(new Response('verified zip'));
              });
            }
            return new Response('verified zip');
          },
        },
      };
      window.fetch = async (_url, options = {}) => {
        if (options.method === 'POST') {
          window.uploads++;
          return new Response(
            JSON.stringify({ id: 'scratch-tab', version: '1.1.0', upgraded: [] }),
          );
        }
        return new Response(JSON.stringify([{ id: 'scratch-tab', version: '1.0.0' }]));
      };
      const options = {
        remote: window.createRemote(remote),
        projectId: 'p1',
        drafts: new Map(),
        reload: () => window.reloads++,
      };
      window.closeFirst = mountUpdates(document.querySelector<HTMLElement>('#first')!, options);
      window.closeSecond = mountUpdates(document.querySelector<HTMLElement>('#second')!, options);
    });
    let confirmations = 0;
    page.on('dialog', async dialog => {
      confirmations++;
      await dialog.accept();
    });
    const first = page.locator('#first');
    const second = page.locator('#second');
    await first.getByText('Version 1.1.0 is available', { exact: false }).waitFor();
    await second.getByText('Version 1.1.0 is available', { exact: false }).waitFor();
    await first.getByRole('button', { name: 'Update', exact: true }).click();
    await page.waitForFunction(() => typeof window.finishDownload === 'function');
    await page.evaluate(() => window.closeFirst());
    assert.equal(await page.evaluate(() => window.firstSignal.aborted), true);
    await second.getByRole('button', { name: 'Update', exact: true }).click();
    assert.equal(confirmations, 1);
    assert.equal(await page.evaluate(() => window.downloads), 1);
    await page.evaluate(async () => {
      window.finishDownload();
      // Let the cancelled request unwind through beforeUpload and release the lock.
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(await page.evaluate(() => window.uploads), 0);
    await second.getByRole('button', { name: 'Update', exact: true }).click();
    await page.waitForFunction(() => window.reloads === 1);
    assert.equal(confirmations, 2);
    assert.equal(await page.evaluate(() => window.downloads), 2);
    assert.equal(await page.evaluate(() => window.uploads), 1);
    await page.evaluate(() => window.closeSecond());
    assert.equal(await page.locator('.scratch-tab-updates').count(), 0);
  } finally {
    await browser.close();
  }
});

test('chat update notice checks in background, opens updater, and cleans up across chats', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
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
        body: '<div id="toolbar"></div><div id="host"></div>',
      });
    });
    await page.goto('https://remote.test/');
    await page.evaluate(async () => {
      const { default: activate } = await window.importModule('/main.js');
      window.checks = 0;
      window.latest = '0.6.0';
      window.denied = false;
      window.fail = false;
      window.deferred = false;
      window.aborted = false;
      const browserWindow: Window = window;
      window.timers = new Map();
      let timerId = 0;
      browserWindow.setInterval = (fn, ms) => {
        window.timers.set(++timerId, {
          fn: () => {
            if (typeof fn !== 'function') throw new Error('Expected timer callback');
            return fn();
          },
          ms,
        });
        return timerId;
      };
      browserWindow.clearInterval = id => window.timers.delete(id!);
      window.fetch = async () =>
        new Response(JSON.stringify([{ id: 'scratch-tab', version: '0.5.3' }]), {
          status: window.denied ? 403 : 200,
        });
      const remote: RemoteTestFixture = {
        application: { id: 'scratch-tab', version: '0.5.3' },
        slots: {
          chatHeaderActions: 'chat',
          applicationCardActions: 'card',
          sidebarHeaderActions: 'sidebar',
        },
        backend: {
          async call(path, { projectId, signal }) {
            window.checks++;
            window.lastProject = projectId;
            if (window.deferred)
              await new Promise<void>(resolve => {
                window.finishCheck = resolve;
                signal!.addEventListener('abort', () => {
                  window.aborted = true;
                });
              });
            if (window.fail) throw new Error('GitHub unavailable');
            return { version: window.latest };
          },
        },
        ui: {
          register(slot, render) {
            if (slot === 'chat') window.renderChat = render;
            if (slot === 'sidebar') window.ownerCleanup = render()!;
          },
          addIconButton(slot, options) {
            window.iconSlot = slot;
            window.iconOptions = options;
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('aria-label', options.label);
            button.title = options.title;
            button.innerHTML = options.icon;
            button.style.cssText = 'width:32px;height:32px;padding:8px';
            button.onclick = options.onClick;
            document.querySelector<HTMLElement>('#toolbar')!.append(button);
            return () => button.remove();
          },
          openPopup(options) {
            const body = document.createElement('div');
            body.id = 'popup';
            document.body.append(body);
            const cleanup = options.mount(body)!;
            return {
              close() {
                cleanup?.();
                body.remove();
              },
            };
          },
        },
      };
      activate(window.createRemote(remote));
      window.navigate = projectId => {
        window.cleanupChat?.();
        window.cleanupChat = window.renderChat(document.querySelector<HTMLElement>('#host')!, {
          projectId,
          chatId: 'a',
        })!;
      };
      window.navigate('p1');
    });
    const notice = page.getByRole('button', {
      name: 'Scratch Tab update available: v0.6.0',
      exact: true,
    });
    await notice.waitFor();
    assert.equal(await page.evaluate(() => window.iconSlot), 'chat');
    assert.equal(
      await page.evaluate(() => window.iconOptions.when({ projectId: 'p2', chatId: 'a' })),
      false,
    );
    assert.equal(await page.evaluate(() => window.iconOptions.when({ projectId: 'p1' })), false);
    assert.equal(
      await page.evaluate(() => window.iconOptions.when({ projectId: 'p1', chatId: 'b' })),
      true,
    );
    assert.match((await notice.getAttribute('title'))!, /0.6.0.*Click to update/);
    await notice.focus();
    await notice.press('Enter');
    await page.getByText('Version 0.6.0 is available', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Update', exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => window.lastProject), 'p1');
    const checks = await page.evaluate(() => window.checks);
    await page.evaluate(() => window.navigate('p1'));
    assert.equal(await page.locator('#popup').count(), 0);
    assert.equal(await notice.count(), 1);
    assert.equal(await page.evaluate(() => window.checks), checks);
    // An hourly recheck removes the notice when the installed version is current.
    await page.evaluate(async () => {
      const now = Date.now;
      Date.now = () => now() + 3600001;
      window.latest = '0.5.3';
      await [...window.timers.values()].find(t => t.ms === 3600000)!.fn();
      Date.now = now;
    });
    assert.equal(await notice.count(), 0);
    // A different project has its own check and current project target.
    await page.evaluate(() => {
      window.latest = '0.6.0';
      window.navigate('p2');
    });
    await notice.waitFor();
    assert.equal(await page.evaluate(() => window.lastProject), 'p2');
    await page.evaluate(() => {
      window.denied = true;
      window.navigate('p3');
    });
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#toolbar button').count(), 0);
    assert.equal(await page.locator('#popup').count(), 0);
    await page.evaluate(() => {
      window.denied = false;
      window.fail = true;
      window.navigate('p4');
    });
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#toolbar button').count(), 0);
    // A response that arrives after chat disposal cannot recreate a stale notice.
    await page.evaluate(() => {
      window.fail = false;
      window.deferred = true;
      window.navigate('p5');
    });
    await page.waitForFunction(() => typeof window.finishCheck === 'function');
    await page.evaluate(() => {
      window.cleanupChat();
      window.ownerCleanup();
      window.finishCheck();
    });
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.aborted), true);
    assert.equal(await page.evaluate(() => window.timers.size), 0);
    assert.equal(await page.locator('#toolbar button').count(), 0);
  } finally {
    await browser.close();
  }
});

test('responsive toolbar mounts share one Scratch Tab update notice', async () => {
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
        body: '<div id="desktop"></div><div id="mobile" hidden></div>',
      });
    });
    await page.goto('https://remote.test/');
    const interceptsFile = (chatId: string) =>
      page.evaluate(chatId => {
        const link = document.createElement('a');
        link.href = `/api/chats/${chatId}/ide-open?path=/workspace/note.txt`;
        document.body.append(link);
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        let intercepted = true;
        link.addEventListener('click', event => {
          intercepted = false;
          event.preventDefault();
        });
        link.dispatchEvent(click);
        link.remove();
        return intercepted;
      }, chatId);
    await page.evaluate(async () => {
      const { default: activate } = await window.importModule('/main.js');
      const hosts = [
        document.querySelector<HTMLElement>('#desktop')!,
        document.querySelector<HTMLElement>('#mobile')!,
      ];
      window.checks = 0;
      const browserWindow: Window = window;
      window.intervalIds = new Set();
      const setInterval = browserWindow.setInterval;
      const clearInterval = browserWindow.clearInterval;
      browserWindow.setInterval = (handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        const id = setInterval(handler, timeout, ...args);
        window.intervalIds.add(id);
        return id;
      };
      browserWindow.clearInterval = id => {
        window.intervalIds.delete(id!);
        clearInterval(id);
      };
      window.fetch = async () =>
        new Response(JSON.stringify([{ id: 'scratch-tab', version: '0.6.3' }]));
      const remote: RemoteTestFixture = {
        application: { id: 'scratch-tab', version: '0.6.3' },
        slots: {
          chatHeaderActions: 'chat',
          applicationCardActions: 'card',
          sidebarHeaderActions: 'sidebar',
        },
        backend: {
          async call(path) {
            if (path === 'file') return { content: 'note', revision: 'initial' };
            window.checks++;
            return { version: '0.7.0' };
          },
        },
        ui: {
          register(slot, mount) {
            if (slot === 'chat') window.mountChatActions = mount;
            if (slot === 'sidebar') window.ownerCleanup = mount(document.createElement('div'), {})!;
          },
          // Remote registers one icon contribution globally and renders it in every slot host.
          addIconButton(_slot, options) {
            const buttons = hosts.map(host => {
              const button = document.createElement('button');
              button.setAttribute('aria-label', options.label);
              button.innerHTML = options.icon;
              host.append(button);
              return button;
            });
            return () => buttons.forEach(button => button.remove());
          },
        },
      };
      activate(window.createRemote(remote));
      const context = { projectId: 'p1', chatId: 'a' };
      window.desktopCleanup = window.mountChatActions(hosts[0], context)!;
      window.mobileCleanup = window.mountChatActions(hosts[1], context)!;
    });
    await page.waitForFunction(() => document.querySelectorAll('#desktop button').length > 0);
    assert.equal(
      await page.locator('#desktop button').count(),
      1,
      'one visible icon despite two mounted toolbar slots',
    );
    assert.equal(await page.locator('#mobile button').count(), 1);
    assert.equal(await page.evaluate(() => window.checks), 1);
    assert.equal(await page.evaluate(() => window.intervalIds.size), 1);
    await page.evaluate(() => window.mobileCleanup());
    assert.equal(await interceptsFile('a'), true, 'remaining header keeps file capture active');
    assert.equal(
      await page.locator('#desktop button').count(),
      1,
      'the remaining owner keeps its notice',
    );
    assert.equal(await page.evaluate(() => window.intervalIds.size), 1);
    await page.evaluate(() => {
      window.nextCleanup = window.mountChatActions(
        document.querySelector<HTMLElement>('#mobile')!,
        {
          projectId: 'p2',
          chatId: 'b',
        },
      )!;
    });
    await page.waitForFunction(
      () => window.checks === 2 && document.querySelectorAll('#desktop button').length === 1,
    );
    await page.evaluate(() => window.desktopCleanup());
    assert.equal(await interceptsFile('b'), true, 'stale project cleanup keeps new capture active');
    assert.equal(
      await page.locator('#desktop button').count(),
      1,
      'old project cleanup cannot remove the new notice',
    );
    assert.equal(await page.evaluate(() => window.intervalIds.size), 1);
    await page.evaluate(() => {
      window.lastCleanup = window.mountChatActions(
        document.querySelector<HTMLElement>('#desktop')!,
        {
          projectId: 'p2',
          chatId: 'c',
        },
      )!;
    });
    await page.waitForFunction(() => document.querySelectorAll('#desktop button').length === 1);
    await page.evaluate(() => window.nextCleanup());
    assert.equal(await interceptsFile('c'), true, 'remaining chat owner keeps capture active');
    assert.equal(
      await page.locator('#desktop button').count(),
      1,
      'old chat cleanup cannot remove the new notice',
    );
    assert.equal(await page.evaluate(() => window.intervalIds.size), 1);
    await page.evaluate(() => window.lastCleanup());
    assert.equal(await interceptsFile('c'), false, 'last header cleanup suspends file capture');
    await page.evaluate(() => window.ownerCleanup());
    assert.equal(await page.locator('#desktop button').count(), 0);
    assert.equal(await page.evaluate(() => window.intervalIds.size), 0);
  } finally {
    await browser.close();
  }
});
