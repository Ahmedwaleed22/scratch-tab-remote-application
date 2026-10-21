import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runtimeModule } from './support/runtime.mjs';

test('chat update notice checks in background, opens updater, and cleans up across chats', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
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
      const { default: activate } = await import('/main.js');
      window.checks = 0;
      window.latest = '0.6.0';
      window.denied = false;
      window.fail = false;
      window.deferred = false;
      window.aborted = false;
      window.timers = new Map();
      let timerId = 0;
      window.setInterval = (fn, ms) => {
        window.timers.set(++timerId, { fn, ms });
        return timerId;
      };
      window.clearInterval = id => window.timers.delete(id);
      window.fetch = async () =>
        new Response(JSON.stringify([{ id: 'scratch-tab', version: '0.5.3' }]), {
          status: window.denied ? 403 : 200,
        });
      const remote = {
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
              await new Promise(resolve => {
                window.finishCheck = resolve;
                signal.addEventListener('abort', () => {
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
            if (slot === 'sidebar') window.ownerCleanup = render();
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
            document.querySelector('#toolbar').append(button);
            return () => button.remove();
          },
          openPopup(options) {
            const body = document.createElement('div');
            body.id = 'popup';
            document.body.append(body);
            const cleanup = options.mount(body);
            return {
              close() {
                cleanup?.();
                body.remove();
              },
            };
          },
        },
      };
      activate(remote);
      window.navigate = projectId => {
        window.cleanupChat?.();
        window.cleanupChat = window.renderChat(document.querySelector('#host'), {
          projectId,
          chatId: 'a',
        });
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
    assert.match(await notice.getAttribute('title'), /0.6.0.*Click to update/);
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
      await [...window.timers.values()].find(t => t.ms === 3600000).fn();
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
