import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const { fileTarget } = await import(new URL('../ui/scripts/links.js', import.meta.url));
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
 const page = await browser.newPage({ viewport: { width:Number(process.env.SCRATCH_TAB_WIDTH || 1280), height:720 } });
 await page.route('https://remote.test/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('.js')) return route.fulfill({ contentType:'text/javascript', body:await readFile(new URL('../ui/scripts' + path, import.meta.url), 'utf8') });
  if (path.endsWith('/files/download')) return route.fulfill({ body:'A small file\n<script>safe</script>' });
  return route.fulfill({ contentType:'text/html', body:'<div id="host"></div><a href="/api/chats/a/ide-open?path=%2Fworkspace%2Fnotes.txt">notes</a>' });
 });
 await page.goto('https://remote.test/');
 const dark = process.env.SCRATCH_TAB_THEME === 'dark';
 await page.addStyleTag({ content: `:root { --bg-surface-rgb:${dark ? '20 21 25' : '244 245 248'}; --bg-raised-rgb:${dark ? '27 28 33' : '255 255 255'}; --fg:${dark ? '227 227 231' : '31 36 44'}; --accent-blue:${dark ? '138 180 255' : '47 111 235'}; --line:${dark ? 'rgba(255,255,255,.07)' : 'rgba(15,20,28,.1)'}; } body { background:${dark ? '#101114' : '#fff'}; color:rgb(var(--fg)); font:13px system-ui; } a {color:rgb(var(--accent-blue));}` });
 await page.addStyleTag({ content:await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8') });
 await page.evaluate(async () => {
  const { default:activate } = await import('/main.js');
  window.dispose = null;
  window.disk = 'A small file\n<script>safe</script>';
  window.revision = 'original';
  window.failSave = false;
  const backend = { async call(path, {body}) {
    window.lastFilePath = body.path;
    if (body.save) {
      if (window.failSave) throw new Error('File changed on disk');
      if (window.deferSave) await new Promise(resolve => { window.completeSave = resolve; });
      window.disk = body.content; window.revision = 'saved';
      return { revision: window.revision };
    }
    return { content: window.disk, revision: window.revision };
  } };
  const remote = { backend, slots:{chatHeaderActions:'header'}, ui:{ register(slot, render) { window.dispose = render(document.querySelector('#host'), {chatId:'a',projectId:'p1',cwd:'/var/lib/remote/projects/alpha/workspace'}); }, openPopup(options) { const body=document.createElement('div'); body.id='chooser'; document.body.append(body); options.mount?.(body); return {close:()=>body.remove()}; } } };
  window.mount = () => activate(remote);
  window.mount();
 });
 assert.equal(await page.locator('#host button').count(), 0);
 await page.getByText('notes', {exact:true}).click();
 const choices = page.locator('.scratch-tab-choice');
 assert.equal(await choices.getByRole('button').count(), 2);
 const left = await choices.getByRole('button', {name:'Scratch Tab',exact:true}).boundingBox();
 const right = await choices.getByRole('button', {name:'Code Server',exact:true}).boundingBox();
 assert.equal(left.y, right.y); assert.ok(right.x > left.x);
 await choices.getByRole('button', {name:'Scratch Tab',exact:true}).press('ArrowRight');
 assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Code Server');
 await choices.getByRole('button', {name:'Scratch Tab',exact:true}).press('Escape');
 assert.equal(await choices.count(), 0);
 await page.getByText('notes', {exact:true}).click();
 await page.mouse.click(Number(process.env.SCRATCH_TAB_WIDTH || 1280) - 8, 700);
 assert.equal(await choices.count(), 0);
 await page.getByText('notes', {exact:true}).click();
 if (process.env.SCRATCH_TAB_SCREENSHOTS) await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-chooser.png' });
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Scratch Tab',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('A small file'));
 if (process.env.SCRATCH_TAB_SCREENSHOTS) await page.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-editor.png' });
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
 assert.equal(await page.locator('.scratch-tab-controls button').count(), 1);
 assert.equal(await page.getByRole('button', {name:'Close file',exact:true}).textContent(), '');
 assert.equal(await page.getByRole('button', {name:'Save',exact:true}).evaluate(node => !!node.closest('header')), true);
 assert.equal(await page.getByRole('button', {name:'Open in Code Server',exact:true}).evaluate(node => !!node.closest('header')), true);
 const header = page.locator('.scratch-tab-header');
 const before = await page.locator('.scratch-tab-window').boundingBox();
 await header.focus(); await header.press('ArrowRight');
 const after = await page.locator('.scratch-tab-window').boundingBox();
 assert.equal(after.x, before.x + (Number(process.env.SCRATCH_TAB_WIDTH || 1280) <= 600 ? 0 : 20));
 await page.getByRole('button', {name:'Close file'}).click();
 assert.equal(await page.locator('.scratch-tab-window').count(), 0);
 await page.getByText('notes', {exact:true}).click();
 assert.equal(await page.locator('.scratch-tab-choice').count(), 1);
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Scratch Tab',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
 await page.locator('textarea').fill('Draft survives chat change');
 await page.evaluate(() => window.dispose());
 assert.equal(await page.locator('.scratch-tab-window').count(), 0);
 assert.equal(await page.evaluate(() => { const a=document.querySelector('a'); const event=new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}); a.dispatchEvent(event); return event.defaultPrevented; }), false);
 await page.evaluate(() => { document.querySelector('#host').replaceChildren(); window.mount(); });
 await page.getByText('notes', {exact:true}).click();
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Scratch Tab',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Draft survives chat change');
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => window.disk === 'Draft survives chat change');
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 await page.evaluate(() => { window.disk = ''; });
 await page.getByText('notes', {exact:true}).click();
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Scratch Tab',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
 assert.equal(await page.locator('textarea').inputValue(), '');
 await page.locator('textarea').fill('Write an empty file');
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => window.disk === 'Write an empty file');
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 await page.evaluate(() => { window.disk = 'one\r\ntwo\r\n'; });
 await page.getByText('notes', {exact:true}).click();
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Scratch Tab',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
 assert.equal(await page.locator('textarea').inputValue(), 'one\ntwo\n');
 await page.locator('textarea').fill('changed\n');
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => window.disk === 'changed\r\n');
 await page.evaluate(() => { window.deferSave = true; });
 await page.locator('textarea').fill('pending\n');
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => typeof window.completeSave === 'function');
 await page.locator('textarea').fill('newer\n');
 await page.evaluate(() => { window.deferSave = false; window.completeSave(); });
 await page.getByText('Saved earlier changes · Unsaved edits remain', {exact:true}).waitFor();
 assert.equal(await page.evaluate(() => window.disk), 'pending\r\n');
 assert.equal(await page.getByRole('button', {name:'Save',exact:true}).isDisabled(), false);
 await page.getByRole('button', {name:'Save',exact:true}).click();
 await page.waitForFunction(() => window.disk === 'newer\r\n');
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 await page.evaluate(() => {
   document.querySelector('a').href = 'https://code--alpha.remote.test/_static/remote-open.html?folder=%2Fworkspace&file=%2Fworkspace%2FREADME.md&line=3';
   window.open = (...args) => { window.opened = args; return null; };
 });
 await page.getByText('notes', {exact:true}).click();
 assert.equal(await page.locator('.scratch-tab-choice').count(), 1);
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Scratch Tab',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
 assert.equal(await page.locator('.scratch-tab-window').getAttribute('aria-label'), 'README.md');
 await page.getByRole('button', {name:'Open in Code Server'}).click();
 assert.match(await page.evaluate(() => window.opened[0]), /code--alpha.*README.md&line=3/);
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 await page.getByText('notes', {exact:true}).click();
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Code Server',exact:true}).click();
 assert.match(await page.evaluate(() => window.opened[0]), /code--alpha.*README.md&line=3/);
 await page.evaluate(() => {
   const pane = document.createElement('aside'); pane.id = 'workspace-files-pane';
   pane.innerHTML = '<div id="manager-file" role="button" tabindex="0" title="Open guide.md in application"><span>guide.md</span><a download="guide.md" href="/api/chats/a/files/download?path=docs%2Fguide.md">Download</a></div><div id="manager-folder" role="button" tabindex="0"><span>docs</span><a href="/api/chats/a/files/download-folder?path=docs">Download folder</a></div><div id="manager-media" role="button" title="View photo.png"><span>photo.png</span><a download="photo.png" href="/api/chats/a/files/download?path=photo.png">Download</a></div>';
   document.body.append(pane);
   window.originalOpens = 0; window.folderOpens = 0; window.mediaOpens = 0; window.downloads = 0;
   const row = document.querySelector('#manager-file');
   row.onclick = () => { window.originalOpens++; window.open('https://code--alpha.remote.test/_static/remote-open.html?file=/workspace/docs/guide.md', '_blank'); };
   row.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); } };
   row.querySelector('a').onclick = event => { event.preventDefault(); event.stopPropagation(); window.downloads++; };
   document.querySelector('#manager-folder').onclick = () => window.folderOpens++;
   document.querySelector('#manager-media').onclick = () => window.mediaOpens++;
 });
 await page.locator('#manager-file span').click();
 assert.equal(await page.evaluate(() => window.originalOpens), 0);
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Scratch Tab',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('textarea')?.readOnly === false);
 assert.equal(await page.locator('.scratch-tab-window').getAttribute('aria-label'), 'guide.md');
 assert.equal(await page.evaluate(() => window.lastFilePath), '/workspace/docs/guide.md');
 await page.getByRole('button', {name:'Open in Code Server'}).click();
 assert.equal(await page.evaluate(() => window.originalOpens), 1);
 await page.getByRole('button', {name:'Close file',exact:true}).click();
 await page.locator('#manager-file').focus();
 await page.locator('#manager-file').press('Enter');
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Code Server',exact:true}).click();
 assert.equal(await page.evaluate(() => window.originalOpens), 2);
 await page.locator('#manager-file').focus();
 await page.locator('#manager-file').press('Space');
 await page.locator('.scratch-tab-choice').getByRole('button', {name:'Scratch Tab',exact:true}).press('Escape');
 await page.locator('#manager-file a').click();
 assert.equal(await page.evaluate(() => window.downloads), 1);
 await page.locator('#manager-folder span').click();
 await page.locator('#manager-media span').click();
 assert.equal(await page.evaluate(() => window.folderOpens), 1);
 assert.equal(await page.evaluate(() => window.mediaOpens), 1);
 assert.equal(await page.locator('.scratch-tab-choice').count(), 0);
 await page.getByText('notes', {exact:true}).click();
 assert.equal(await page.locator('.scratch-tab-choice').count(), 1);
 await page.evaluate(() => window.dispose());
 assert.equal(await page.locator('.scratch-tab-choice').count(), 0);
 } finally { await browser.close(); }
});

test('phone editor stays inside the visible viewport through keyboard and rotation changes', async () => {
 const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
 try {
  const page = await browser.newPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await page.route('https://remote.test/**', async route => {
   const path = new URL(route.request().url()).pathname;
   if (path.endsWith('.js')) return route.fulfill({ contentType:'text/javascript', body:await readFile(new URL('../ui/scripts' + path, import.meta.url),'utf8') });
   return route.fulfill({ contentType:'text/html', body:'<meta name="viewport" content="width=device-width, initial-scale=1"><a id="file" href="#">README.md</a>' });
  });
  await page.goto('https://remote.test/');
  await page.addStyleTag({ content:await readFile(new URL('../ui/style/scratch.css', import.meta.url),'utf8') });
  await page.evaluate(async () => {
   const { createEditorWindow } = await import('/views/editorWindow.js');
   const { createButton } = await import('/views/button.js');
   window.lifetime = new AbortController();
   window.saved = ''; window.opened = 0;
   window.view = createEditorWindow({
    target:{name:'a-very-long-file-name-in-a-deep-folder.md',path:'/workspace/README.md'}, index:5,
    signal:window.lifetime.signal, button:(text,action,parent) => createButton(text,action,parent,window.lifetime.signal),
    nextLayer:() => 201, onClose:() => { window.lifetime.abort(); window.view.remove(); },
    onSave:() => { window.saved = window.view.text; }, onOpenIde:() => window.opened++, onEdit:() => {},
   });
   window.view.setText('# README\n\nEditable on a phone.'); window.view.allowEditing();
   window.view.render({canSave:true,dirty:false}); window.view.setStatus('UTF-8 · Ctrl/Cmd+S to save'); window.view.focus();
  });
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'HEADER');
  async function assertFits(width, height, top=0, left=0) {
   for (const selector of ['.scratch-tab-window','.scratch-tab-header','textarea','.scratch-tab-actions button:first-child','.scratch-tab-actions button:last-child','.scratch-tab-controls button','footer']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box.x >= left && box.y >= top && box.x+box.width <= left+width+1 && box.y+box.height <= top+height+1, `${selector}: ${JSON.stringify(box)} outside ${width}x${height} at ${left},${top}`);
   }
  }
  for (const width of [320,375,390,430]) {
   await page.setViewportSize({width,height:844});
   await assertFits(width,844);
   assert.equal(await page.locator('textarea').evaluate(node => getComputedStyle(node).fontSize),'16px');
   for (const button of await page.locator('.scratch-tab-window button').all()) assert.ok((await button.boundingBox()).height >= 44);
  }
  await page.locator('textarea').fill('Mobile edit');
  await page.getByRole('button',{name:'Save',exact:true}).tap();
  assert.equal(await page.evaluate(() => window.saved),'Mobile edit');
  await page.getByRole('button',{name:'Open in Code Server'}).tap();
  assert.equal(await page.evaluate(() => window.opened),1);
  // Model the visual viewport shrinking and panning while Safari's keyboard is open.
  await page.evaluate(() => {
   const viewport = window.visualViewport;
   for (const [key,value] of Object.entries({width:430,height:340,offsetLeft:0,offsetTop:160})) Object.defineProperty(viewport,key,{configurable:true,writable:true,value});
   viewport.dispatchEvent(new Event('resize'));
  });
  await assertFits(430,340,160);
  assert.equal(await page.locator('textarea').inputValue(),'Mobile edit');
  await page.evaluate(() => {
   Object.assign(window.visualViewport,{width:390,height:300,offsetLeft:20,offsetTop:180});
   window.visualViewport.dispatchEvent(new Event('scroll'));
  });
  await assertFits(390,300,180,20);
  await page.evaluate(() => { for (const key of ['width','height','offsetLeft','offsetTop']) delete window.visualViewport[key]; });
  await page.setViewportSize({width:844,height:390});
  await assertFits(844,390);
  await page.setViewportSize({width:390,height:844});
  await assertFits(390,844);
  if (process.env.SCRATCH_TAB_SCREENSHOTS) await page.screenshot({path:process.env.SCRATCH_TAB_SCREENSHOTS+'-mobile.png'});
  await page.getByRole('button',{name:'Close file'}).tap();
  assert.equal(await page.locator('.scratch-tab-window').count(),0);
 } finally { await browser.close(); }
});
