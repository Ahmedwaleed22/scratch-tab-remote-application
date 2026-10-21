import { test } from 'vitest';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runtimeModule, installBrowserImports } from './support/runtime.js';

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
