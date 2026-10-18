import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const source = await readFile(new URL('../ui/scripts/main.js', import.meta.url), 'utf8');
const { fileTarget } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('matches current chat workspace links and preserves IDE line reference', () => {
 const target = fileTarget('/api/chats/a/ide-open?path=%2Fworkspace%2Fnote.txt%3A3', 'https://remote.test', 'a');
 assert.equal(target.path, '/workspace/note.txt');
 assert.match(target.ide, /%3A3/);
 assert.equal(target.download, '/api/chats/a/files/download?path=note.txt');
});
test('ignores external, other chat, media, traversal and host links', () => {
 for (const href of ['https://other.test/api/chats/a/ide-open?path=/workspace/a', '/api/chats/b/ide-open?path=/workspace/a', '/api/chats/a/media-open?path=/workspace/a.png', '/api/chats/a/ide-open?path=/workspace/../etc/passwd', '/api/chats/a/ide-open?path=/etc/passwd']) assert.equal(fileTarget(href, 'https://remote.test', 'a'), null);
});
test('recognizes Code Server app links in the active project', () => {
 const origin = 'https://remote.test';
 const cwd = '/var/lib/remote/projects/alpha/workspace';
 const href = 'https://code--alpha.remote.test/_static/remote-open.html?folder=%2Fworkspace&file=%2Fworkspace%2FREADME.md&line=3';
 const target = fileTarget(href, origin, 'a', cwd);
 assert.equal(target?.path, '/workspace/README.md');
 assert.equal(target?.ide, href);
});
test('does not intercept Code Server links for other projects or domains', () => {
 const cwd = '/var/lib/remote/projects/alpha/workspace';
 for (const href of ['https://code--beta.remote.test/_static/remote-open.html?file=/workspace/README.md', 'https://code--alpha.evil.test/_static/remote-open.html?file=/workspace/README.md']) {
  assert.equal(fileTarget(href, 'https://remote.test', 'a', cwd), null);
 }
});
test('supports legacy Code Server payloads and current-project host paths', () => {
 const origin = 'https://remote.test';
 const cwd = '/var/lib/remote/projects/alpha/workspace/docs';
 const url = new URL('https://code.remote.test/alpha/');
 url.searchParams.set('payload', JSON.stringify([['openFile', 'vscode-remote://code.remote.test/workspace/a%20b.txt:4:2']]));
 assert.equal(fileTarget(url.href, origin, 'a', cwd)?.path, '/workspace/a b.txt');
 assert.equal(fileTarget('/api/chats/a/ide-open?path=/var/lib/remote/projects/alpha/workspace/README.md', origin, 'a', cwd)?.path, '/workspace/README.md');
 assert.equal(fileTarget('/api/chats/a/ide-open?path=/var/lib/remote/projects/beta/workspace/README.md', origin, 'a', cwd), null);
 url.searchParams.set('payload', '{bad');
 assert.equal(fileTarget(url.href, origin, 'a', cwd), null);
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
  window.disk = 'A small file\n<script>safe</script>';
  window.revision = 'original';
  window.failSave = false;
  const backend = { async call(path, {body}) {
    if (body.save) {
      if (window.failSave) throw new Error('File changed on disk');
      window.disk = body.content; window.revision = 'saved';
      return { revision: window.revision };
    }
    return { content: window.disk, revision: window.revision };
  } };
  const remote = { backend, slots:{chatHeaderActions:'header'}, ui:{ register(slot, render) { window.dispose = render(document.querySelector('#host'), {chatId:'a',projectId:'p1',cwd:'/var/lib/remote/projects/alpha/workspace'}); }, openPopup(options) { const body=document.createElement('div'); body.id='chooser'; document.body.append(body); options.mount?.(body); return {close:()=>body.remove()}; } } };
  window.mount = () => activate(remote);
  window.mount();
 });
 await page.getByText('notes', {exact:true}).click();
 await page.getByText('Scratch Tab · lightweight editor').click();
 await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('A small file'));
 assert.equal(await page.locator('script').count(), 0);
 await page.locator('textarea').fill('Edited text');
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => window.disk === 'Edited text');
 assert.equal(await page.getByRole('button', {name:'Save',exact:true}).isDisabled(), true);
 await page.locator('textarea').fill('Unsaved conflict');
 await page.evaluate(() => { window.failSave = true; });
 await page.locator('textarea').press('Control+s');
 await page.getByText('File changed on disk', {exact:true}).waitFor();
 assert.equal(await page.locator('textarea').inputValue(), 'Unsaved conflict');
 page.once('dialog', dialog => dialog.dismiss());
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 assert.equal(await page.locator('.scratch-tab-window').count(), 1);
 await page.evaluate(() => { window.failSave = false; });
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => window.disk === 'Unsaved conflict');
 await page.getByRole('button', {name:'Minimize file',exact:true}).click();
 assert.equal(await page.locator('textarea').isVisible(), false);
 await page.getByRole('button', {name:'Restore file',exact:true}).click();
 await page.getByRole('button', {name:'Toggle maximize'}).click();
 assert.equal(await page.locator('.scratch-tab-maximized').count(), 1);
 await page.getByRole('button', {name:'Close file'}).click();
 assert.equal(await page.locator('.scratch-tab-window').count(), 0);
 await page.getByText('notes', {exact:true}).click();
 assert.equal(await page.locator('#chooser').count(), 1);
 await page.getByText('Scratch Tab · lightweight editor').click();
 await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
 await page.locator('textarea').fill('Draft survives chat change');
 await page.evaluate(() => window.dispose());
 assert.equal(await page.locator('.scratch-tab-window').count(), 0);
 assert.equal(await page.evaluate(() => { const a=document.querySelector('a'); const event=new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}); a.dispatchEvent(event); return event.defaultPrevented; }), false);
 await page.evaluate(() => { document.querySelector('#host').replaceChildren(); window.mount(); });
 await page.getByText('notes', {exact:true}).click();
 await page.getByText('Scratch Tab · lightweight editor').click();
 await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Draft survives chat change');
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => window.disk === 'Draft survives chat change');
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 await page.evaluate(() => { window.disk = ''; });
 await page.getByText('notes', {exact:true}).click();
 await page.getByText('Scratch Tab · lightweight editor').click();
 await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
 assert.equal(await page.locator('textarea').inputValue(), '');
 await page.locator('textarea').fill('Write an empty file');
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => window.disk === 'Write an empty file');
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 await page.evaluate(() => {
   document.querySelector('a').href = 'https://code--alpha.remote.test/_static/remote-open.html?folder=%2Fworkspace&file=%2Fworkspace%2FREADME.md&line=3';
   window.open = (...args) => { window.opened = args; return null; };
 });
 await page.getByText('notes', {exact:true}).click();
 assert.equal(await page.locator('#chooser').count(), 1);
 await page.getByText('Scratch Tab · lightweight editor').click();
 await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
 assert.equal(await page.locator('.scratch-tab-window').getAttribute('aria-label'), 'README.md');
 await page.getByRole('button', {name:'Open in Code Server ↗'}).click();
 assert.match(await page.evaluate(() => window.opened[0]), /code--alpha.*README.md&line=3/);
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 await page.getByText('notes', {exact:true}).click();
 await page.getByText('Code Server · full editor').click();
 assert.match(await page.evaluate(() => window.opened[0]), /code--alpha.*README.md&line=3/);
 await page.evaluate(() => window.dispose());
 } finally { await browser.close(); }
});
