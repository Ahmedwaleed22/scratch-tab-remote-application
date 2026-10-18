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
  const remote = { backend, slots:{chatHeaderActions:'header'}, ui:{ register(slot, render) { if (slot !== 'header') return () => {}; window.dispose = render(document.querySelector('#host'), {chatId:'a',projectId:'p1',cwd:'/var/lib/remote/projects/alpha/workspace'}); }, openPopup(options) { const body=document.createElement('div'); body.id='chooser'; document.body.append(body); options.mount?.(body); return {close:()=>body.remove()}; } } };
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
   // Browser resize events arrive asynchronously after setViewportSize resolves.
   await page.waitForFunction(({width,height,top,left}) => {
    const box = document.querySelector('.scratch-tab-window').getBoundingClientRect();
    return box.x >= left && box.y >= top && box.right <= left+width+1 && box.bottom <= top+height+1;
   }, {width,height,top,left});
   for (const selector of ['.scratch-tab-window','.scratch-tab-header','textarea','.scratch-tab-actions button:first-child','.scratch-tab-actions button:last-child','.scratch-tab-controls button','footer']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box.x >= left && box.y >= top && box.x+box.width <= left+width+1 && box.y+box.height <= top+height+1, `${selector}: ${JSON.stringify(box)} outside ${width}x${height} at ${left},${top}`);
   }
  }
  for (const width of [320,375,390,430]) {
   await page.setViewportSize({width,height:844});
   await assertFits(width,844);
   assert.equal(await page.locator('textarea').evaluate(node => getComputedStyle(node).fontSize),'16px');
   for (const button of await page.locator('.scratch-tab-window button:visible').all()) assert.ok((await button.boundingBox()).height >= 44);
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

test('GitHub updater checks versions, protects drafts, uploads, and reports partial failures', async () => {
 const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage();
  await page.route('https://remote.test/**',async route => {
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('.js')) return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../ui/scripts'+path,import.meta.url),'utf8')});
   return route.fulfill({contentType:'text/html',body:'<div id="updates"></div>'});
  });
  await page.goto('https://remote.test/');
  await page.evaluate(async () => {
   const {mountUpdates,isNewer}=await import('/views/updates.js');
   window.comparisons=[isNewer('0.10.0','0.9.0'),isNewer('0.3.2','0.4.0'),isNewer('0.4.0-beta','0.3.2'),isNewer('0.4.0','0.4.0')];
   window.uploads=0;window.reloads=0;window.drafts=new Map();window.partial=false;window.denied=false;window.badDownload=false;
   const remote={application:{version:'0.3.2'},backend:{
    async call(){return {version:'0.4.0'};},
    async fetch(){if(window.draftDuringDownload) window.drafts.set('new',{content:'new edit'}); return window.badDownload ? new Response(JSON.stringify({error:'Checksum mismatch'}),{status:502}) : new Response('verified zip',{headers:{'Content-Type':'application/zip'}});},
   }};
   window.fetch=async (url,options={}) => {
    if(window.denied)return new Response('{}',{status:403});
    if(options.method==='POST'){
     window.uploads++;
     const zip=options.body.get('package');window.archiveName=zip.name;
     return new Response(JSON.stringify({id:'scratch-tab',version:'0.4.0',upgraded:window.partial ? [{error:'container unavailable'}]:[]}));
    }
    return new Response(JSON.stringify([{id:'scratch-tab',version:'0.3.2'}]));
   };
   window.remount=()=>{window.cleanup?.();window.cleanup=mountUpdates(document.querySelector('#updates'),{remote,projectId:'p1',drafts:window.drafts,reload:()=>window.reloads++});};
   window.remount();
  });
  assert.deepEqual(await page.evaluate(()=>window.comparisons),[true,false,false,false]);
  await page.getByText('Version 0.4.0 is available',{exact:false}).waitFor();
  await page.evaluate(()=>window.drafts.set('a',{content:'unsaved'}));
  await page.getByRole('button',{name:'Update',exact:true}).click();
  await page.getByText('Save or discard all Scratch Tab drafts in this tab before updating.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.uploads),0);
  await page.evaluate(()=>{window.drafts.clear();window.badDownload=true;});
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Update',exact:true}).click();
  await page.getByText('Checksum mismatch',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.reloads),0);
  await page.evaluate(()=>{window.badDownload=false;window.draftDuringDownload=true;});
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Update',exact:true}).click();
  await page.getByText('A Scratch Tab draft was created during download. Save it before updating.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.uploads),0);
  await page.evaluate(()=>{window.draftDuringDownload=false;window.drafts.clear();window.partial=true;});
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Update',exact:true}).click();
  await page.getByText('Package updated, but 1 project upgrade(s) failed.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.reloads),0);
  assert.equal(await page.evaluate(()=>window.archiveName),'scratch-tab-0.4.0.zip');
  await page.evaluate(()=>{window.partial=false;window.remount();});
  await page.getByText('Version 0.4.0 is available',{exact:false}).waitFor();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Update',exact:true}).click();
  await page.waitForFunction(()=>window.reloads===1);
  await page.evaluate(()=>{window.denied=true;window.remount();});
  await page.getByText('Only administrators can update Scratch Tab.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Update',exact:true}).isVisible(),false);
  await page.evaluate(()=>window.cleanup());
  assert.equal(await page.locator('.scratch-tab-updates').count(),0);
 } finally {await browser.close();}
});

test('unsupported Word and binary files offer a download instead of an empty editor', async () => {
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.route('https://remote.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('.js')) return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../ui/scripts'+path,import.meta.url),'utf8')});
   if(path.endsWith('/files/download'))return route.fulfill({body:'original binary content',headers:{'Content-Disposition':'attachment; filename="report.docx"','Content-Type':'application/octet-stream'}});
   return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1">'});
  });
  await page.goto('https://remote.test/');
  await page.addStyleTag({content:await readFile(new URL('../ui/style/scratch.css',import.meta.url),'utf8')});
  await page.evaluate(async()=>{
   const {mountEditor}=await import('/presenters/editor.js');
   const {createEditorWindow}=await import('/views/editorWindow.js');
   const {createButton}=await import('/views/button.js');
   window.reads=0;
   window.showFile=(name,error)=>{
    window.editor?.close(true);
    const target={name,path:'/workspace/'+name,download:'/api/chats/a/files/download?path='+encodeURIComponent(name)};
    window.editor=mountEditor({target,launchIde:()=>{},onClosed:()=>{},
     documentModel:{dirty:false,discardDraft(){},remember(){},read(){window.reads++;return Promise.reject(new Error(error));}},
     createView:handlers=>createEditorWindow({target,index:0,nextLayer:()=>201,button:(label,action,parent)=>createButton(label,action,parent,handlers.signal),...handlers}),
    });
    window.editor.start();
   };
   window.showFile('report.DOCX');
  });
  await page.getByRole('heading',{name:'File not supported'}).waitFor();
  assert.equal(await page.evaluate(()=>window.reads),0);
  assert.equal(await page.locator('textarea').count(),0);
  assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Open in Code Server'}).isVisible(),false);
  const download=page.getByRole('link',{name:'Download file'});
  assert.equal(await download.getAttribute('href'),'/api/chats/a/files/download?path=report.DOCX');
  const pendingDownload=page.waitForEvent('download');
  await download.click();
  assert.equal((await pendingDownload).suggestedFilename(),'report.DOCX');
  await page.setViewportSize({width:320,height:568});
  await page.addStyleTag({content:':root{--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:#424349}'});
  await page.evaluate(()=>window.showFile('report.doc',''));
  const buttonBox=await download.boundingBox();
  assert.ok(buttonBox.width>44 && buttonBox.height>=44 && buttonBox.x>=0 && buttonBox.x+buttonBox.width<=320);
  await download.focus();
  assert.equal(await download.evaluate(node=>node===document.activeElement),true);
  if(process.env.SCRATCH_TAB_SCREENSHOTS)await page.screenshot({path:process.env.SCRATCH_TAB_SCREENSHOTS+'-unsupported.png'});
  await page.evaluate(()=>window.showFile('archive.zip','Only UTF-8 text files up to 128 KiB are supported.'));
  await page.getByRole('heading',{name:'File not supported'}).waitFor();
  assert.equal(await page.evaluate(()=>window.reads),1);
  assert.equal(await download.getAttribute('href'),'/api/chats/a/files/download?path=archive.zip');
  await page.evaluate(()=>window.showFile('notes.txt','Project unavailable'));
  await page.getByText('Project unavailable',{exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'File not supported'}).count(),0);
  await page.getByRole('button',{name:'Close file'}).click();
  assert.equal(await page.locator('.scratch-tab-window').count(),0);
 } finally {await browser.close();}
});

test('updater belongs only to Scratch Tab card and closes with its owner', async () => {
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage();
  await page.route('https://remote.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../ui/scripts'+path,import.meta.url),'utf8')});
   return route.fulfill({contentType:'text/html',body:'<div id="card"></div><div id="other"></div>'});
  });
  await page.goto('https://remote.test/');
  await page.evaluate(async()=>{
   const {default:activate}=await import('/main.js');
   window.slots=[];window.projects=[];
   window.fetch=async()=>new Response(JSON.stringify([{id:'scratch-tab',version:'0.4.1'}]));
   activate({application:{id:'scratch-tab',version:'0.4.1'},slots:{applicationCardActions:'card',chatHeaderActions:'chat'},backend:{async call(path,options){window.projects.push(options.projectId);return {version:'0.4.2'};}},ui:{
    register(slot,render,options){
     window.slots.push(slot);
     if(slot!=='card')return;
     for(const [id,app] of [['card','scratch-tab'],['other','redis']]){
      const context={projectId:'p1',instance:{applicationId:app}};
      if(options.when(context))window.cardCleanup=render(document.getElementById(id),context);
     }
    },
    openPopup(options){const body=document.createElement('div');body.id='popup';document.body.append(body);const cleanup=options.mount(body);return {close(){cleanup?.();body.remove();}};},
   }});
  });
  assert.deepEqual(await page.evaluate(()=>window.slots),['card','chat']);
  assert.equal(await page.locator('#other button').count(),0);
  await page.getByRole('button',{name:'Updates',exact:true}).click();
  await page.getByText('Version 0.4.2 is available',{exact:false}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.projects),['p1']);
  assert.equal(await page.getByRole('button',{name:'Update',exact:true}).isVisible(),true);
  await page.evaluate(()=>window.cardCleanup());
  assert.equal(await page.locator('#popup').count(),0);
  assert.equal(await page.locator('#card button').count(),0);
 }finally{await browser.close();}
});

test('file tabs retain independent edits, detach into windows, and protect dirty closes', async () => {
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.route('https://remote.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../ui/scripts'+path,import.meta.url),'utf8')});
   return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><a href="/api/chats/a/ide-open?path=/workspace/one.txt">First file</a><a href="/api/chats/a/ide-open?path=/workspace/two.txt">Second file</a><a href="/api/chats/a/ide-open?path=/workspace/three.txt">Third file</a>'});
  });
  await page.goto('https://remote.test/');
  await page.addStyleTag({content:await readFile(new URL('../ui/style/scratch.css',import.meta.url),'utf8')});
  await page.evaluate(async()=>{
   const {mountChat}=await import('/app/chat.js');
   window.disk={'/workspace/one.txt':'first','/workspace/two.txt':'second','/workspace/three.txt':'third'};
   window.reads=0;window.drafts=new Map();
   window.cleanup=mountChat({context:{chatId:'a',projectId:'p1'},drafts:window.drafts,launchIde:()=>{},files:{
    async read(path){window.reads++;return {content:window.disk[path],revision:'initial'};},
    async save(path,content){window.disk[path]=content;return {revision:'saved'};},
   }});
  });
  const open=async name=>{
   await page.getByRole('link',{name}).click({force:true});
   await page.locator('.scratch-tab-choice').getByRole('button',{name:'Scratch Tab',exact:true}).click();
  };
  const visible=page.locator('.scratch-tab-window:visible');
  await open('First file');
  await visible.locator('textarea').fill('first draft');
  await visible.evaluate(node=>{node.style.left='120px';node.style.width='700px';});
  await open('Second file');
  assert.equal(await visible.evaluate(node=>node.style.left),'120px');
  assert.equal(await visible.evaluate(node=>node.style.width),'700px');
  assert.equal(await visible.count(),1);
  assert.equal(await visible.getByRole('tab').count(),2);
  assert.equal(await visible.locator('textarea').inputValue(),'second');
  await visible.locator('textarea').fill('second draft');
  await visible.getByRole('tab',{name:'one.txt',exact:false}).click();
  assert.equal(await visible.locator('textarea').inputValue(),'first draft');
  await visible.getByRole('tab',{name:'one.txt',exact:false}).press('ArrowRight');
  assert.equal(await visible.locator('textarea').inputValue(),'second draft');
  assert.equal(await visible.getByRole('tab',{selected:true}).evaluate(node=>node===document.activeElement),true);
  await visible.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>window.disk['/workspace/two.txt']==='second draft');
  assert.equal(await page.evaluate(()=>window.disk['/workspace/one.txt']),'first');
  await visible.getByRole('tab',{name:'one.txt',exact:false}).click();
  page.once('dialog',dialog=>dialog.dismiss());
  await visible.getByRole('button',{name:'Close file',exact:true}).click();
  assert.equal(await visible.getByRole('tab').count(),2);
  assert.equal(await visible.locator('textarea').inputValue(),'first draft');
  if(process.env.SCRATCH_TAB_SCREENSHOTS)await page.screenshot({path:process.env.SCRATCH_TAB_SCREENSHOTS+'-tabs.png'});
  await visible.getByRole('button',{name:'Separate window',exact:true}).click();
  assert.equal(await visible.count(),2);
  const first=page.getByRole('dialog',{name:'one.txt',exact:true});
  const second=page.getByRole('dialog',{name:'two.txt',exact:true});
  if(process.env.SCRATCH_TAB_SCREENSHOTS)await page.screenshot({path:process.env.SCRATCH_TAB_SCREENSHOTS+'-windows.png'});
  assert.equal(await first.locator('textarea').inputValue(),'first draft');
  assert.equal(await second.locator('textarea').inputValue(),'second draft');
  await open('Third file');
  assert.equal(await visible.count(),2);
  const third=page.getByRole('dialog',{name:'three.txt',exact:true});
  assert.equal(await third.getByRole('tab').count(),2);
  await open('First file');
  assert.equal(await page.evaluate(()=>window.reads),3);
  assert.equal(await first.isVisible(),true);
  await page.setViewportSize({width:320,height:568});
  await page.addStyleTag({content:':root{--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:#424349}'});
  await page.waitForFunction(()=>document.querySelector('.scratch-tab-window').getBoundingClientRect().width<=320);
  const bounds=await first.boundingBox();
  assert.ok(bounds.x>=0 && bounds.x+bounds.width<=320);
  const bar=await first.locator('.scratch-tab-tabbar').boundingBox();
  assert.ok(bar.x>=0 && bar.x+bar.width<=320);
  assert.ok((await first.getByRole('button',{name:'Separate window',exact:true}).boundingBox()).height>=44);
  if(process.env.SCRATCH_TAB_SCREENSHOTS)await page.screenshot({path:process.env.SCRATCH_TAB_SCREENSHOTS+'-tabs-mobile.png'});
  page.once('dialog',dialog=>dialog.accept());
  await first.getByRole('button',{name:'Close file',exact:true}).click();
  assert.equal(await third.isVisible(),true);
  assert.equal(await second.isVisible(),true);
  await page.evaluate(()=>window.cleanup());
  assert.equal(await page.locator('.scratch-tab-window').count(),0);
 }finally{await browser.close();}
});
