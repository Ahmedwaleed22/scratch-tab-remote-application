import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const source = await readFile(new URL('../ui/scripts/main.js', import.meta.url), 'utf8');
const { fileTarget, readText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('matches current chat workspace links and preserves IDE line reference', () => {
 const target = fileTarget('/api/chats/a/ide-open?path=%2Fworkspace%2Fnote.txt%3A3', 'https://remote.test', 'a');
 assert.equal(target.path, '/workspace/note.txt');
 assert.match(target.ide, /%3A3/);
 assert.equal(target.download, '/api/chats/a/files/download?path=note.txt');
});
test('ignores external, other chat, media, traversal and host links', () => {
 for (const href of ['https://other.test/api/chats/a/ide-open?path=/workspace/a', '/api/chats/b/ide-open?path=/workspace/a', '/api/chats/a/media-open?path=/workspace/a.png', '/api/chats/a/ide-open?path=/workspace/../etc/passwd', '/api/chats/a/ide-open?path=/etc/passwd']) assert.equal(fileTarget(href, 'https://remote.test', 'a'), null);
});
test('reads UTF-8 including empty files and rejects errors, binary and large files', async () => {
 assert.equal(await readText(new Response('hello ♥')), 'hello ♥');
 assert.equal(await readText(new Response('')), '');
 await assert.rejects(readText(new Response('', { status:403 })), /403/);
 await assert.rejects(readText(new Response(new Uint8Array([0, 1]))), /binary/);
 await assert.rejects(readText(new Response(new Uint8Array([255]))), /UTF-8/);
 await assert.rejects(readText(new Response('x'.repeat(1024*1024+1))), /1 MiB/);
});
test('browser choice, content, controls, modified clicks and disposal', async () => {
 const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
 try {
 const page = await browser.newPage();
 await page.route('https://remote.test/**', route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/main.js')) return route.fulfill({ contentType:'text/javascript', body:source });
  if (path.endsWith('/files/download')) return route.fulfill({ body:'A small file\n<script>safe</script>' });
  return route.fulfill({ contentType:'text/html', body:'<div id="host"></div><a href="/api/chats/a/ide-open?path=%2Fworkspace%2Fnotes.txt">notes</a>' });
 });
 await page.goto('https://remote.test/');
 await page.addStyleTag({ content:await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8') });
 await page.evaluate(async () => {
  const { default:activate } = await import('/main.js');
  window.dispose = null;
  activate({ slots:{chatHeaderActions:'header'}, ui:{ register(slot, render) { window.dispose = render(document.querySelector('#host'), {chatId:'a'}); }, openPopup(options) { const body=document.createElement('div'); body.id='chooser'; document.body.append(body); options.mount?.(body); return {close:()=>body.remove()}; } } });
 });
 await page.getByText('notes', {exact:true}).click();
 await page.getByText('Scratch Tab · quick look').click();
 await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('A small file'));
 assert.equal(await page.locator('script').count(), 0);
 await page.getByRole('button', {name:'Minimize file',exact:true}).click();
 assert.equal(await page.locator('textarea').isVisible(), false);
 await page.getByRole('button', {name:'Restore file',exact:true}).click();
 await page.getByRole('button', {name:'Toggle maximize'}).click();
 assert.equal(await page.locator('.scratch-tab-maximized').count(), 1);
 await page.getByRole('button', {name:'Close file'}).click();
 assert.equal(await page.locator('.scratch-tab-window').count(), 0);
 await page.getByText('notes', {exact:true}).click();
 assert.equal(await page.locator('#chooser').count(), 1);
 await page.getByText('Scratch Tab · quick look').click();
 await page.evaluate(() => window.dispose());
 assert.equal(await page.locator('.scratch-tab-window').count(), 0);
 assert.equal(await page.evaluate(() => { const a=document.querySelector('a'); const event=new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}); a.dispatchEvent(event); return event.defaultPrevented; }), false);
 } finally { await browser.close(); }
});
