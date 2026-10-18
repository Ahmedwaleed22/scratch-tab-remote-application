const LIMIT = 1024 * 1024;

export function fileTarget(href, origin, chatId) {
  const url = new URL(href, origin);
  if (url.origin !== origin || url.pathname !== `/api/chats/${encodeURIComponent(chatId)}/ide-open`) return null;
  const raw = url.searchParams.get('path') || '';
  const path = raw.replace(/(:\d+){1,2}$/, '');
  // Download API takes workspace-relative paths. Leave host paths and folders alone.
  if (!path.startsWith('/workspace/') || path.endsWith('/')) return null;
  const relative = path.slice('/workspace/'.length);
  if (relative.split('/').some(part => part === '..' || part === '.')) return null;
  return { path, name: path.split('/').pop(), ide: url.href,
    download: `/api/chats/${encodeURIComponent(chatId)}/files/download?path=${encodeURIComponent(relative)}` };
}

export async function readText(response) {
  if (!response.ok) throw new Error(`Cannot read file (HTTP ${response.status}).`);
  if (Number(response.headers.get('content-length')) > LIMIT) throw new Error('This file exceeds the 1 MiB limit. Open it in Code Server.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > LIMIT) throw new Error('This file exceeds the 1 MiB limit. Open it in Code Server.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (bytes.includes(0)) throw new Error('This looks like a binary file. Open it in Code Server.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('This file is not UTF-8 text. Open it in Code Server.'); }
}

export default function activate(remote) {
  remote.ui.register(remote.slots.chatHeaderActions, (host, context) => {
    if (!context.chatId) return;
    const lifetime = new AbortController();
    const windows = new Map();
    let chooser;
    let layer = 200;
    const launchIde = target => window.open(target.ide, '_blank', 'noopener,noreferrer');
    function button(label, action, parent) {
      const node = document.createElement('button');
      node.type = 'button'; node.textContent = label;
      node.addEventListener('click', action, { signal: lifetime.signal });
      parent.append(node); return node;
    }
    function open(target) {
      const existing = windows.get(target.path);
      if (existing) { existing.restore(); return; }
      const previous = document.activeElement;
      const request = new AbortController();
      const panel = document.createElement('section');
      panel.className = 'scratch-tab-window';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', target.name);
      panel.style.left = `${Math.min(48 + windows.size * 24, Math.max(8, innerWidth - 350))}px`;
      panel.style.top = `${Math.min(90 + windows.size * 24, Math.max(8, innerHeight - 200))}px`;
      panel.style.zIndex = String(++layer);
      const header = document.createElement('header');
      header.className = 'scratch-tab-header';
      const controls = document.createElement('div'); controls.className = 'scratch-tab-controls';
      header.append(controls);
      const close = () => { request.abort(); panel.remove(); windows.delete(target.path); previous?.focus(); };
      const red = button('×', close, controls); red.setAttribute('aria-label', 'Close file');
      const yellow = button('−', () => { panel.classList.toggle('scratch-tab-minimized'); yellow.setAttribute('aria-label', panel.classList.contains('scratch-tab-minimized') ? 'Restore file' : 'Minimize file'); }, controls);
      yellow.setAttribute('aria-label', 'Minimize file');
      const green = button('↗', () => panel.classList.toggle('scratch-tab-maximized'), controls); green.setAttribute('aria-label', 'Toggle maximize');
      const title = document.createElement('strong'); title.textContent = target.name; title.title = target.path; header.append(title);
      const move = button('Move', () => {}, header);
      move.title = 'Focus and use arrow keys to move window';
      move.addEventListener('keydown', event => {
        const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
        if (delta) { event.preventDefault(); position(panel.offsetLeft + delta[0], panel.offsetTop + delta[1]); }
      });
      const toolbar = document.createElement('div'); toolbar.className = 'scratch-tab-toolbar';
      button('Open in Code Server ↗', () => launchIde(target), toolbar);
      const content = document.createElement('textarea'); content.readOnly = true; content.spellcheck = false;
      content.setAttribute('aria-label', `${target.name} file content`);
      const status = document.createElement('footer'); status.textContent = 'Loading…'; status.setAttribute('role', 'status');
      panel.append(header, toolbar, content, status); document.body.append(panel);
      function position(x, y) {
        panel.style.left = `${Math.max(0, Math.min(x, innerWidth - Math.min(panel.offsetWidth, 180)))}px`;
        panel.style.top = `${Math.max(0, Math.min(y, innerHeight - 48))}px`;
      }
      let drag;
      header.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button') || panel.classList.contains('scratch-tab-maximized')) return;
        drag = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop };
        header.setPointerCapture(event.pointerId);
      });
      header.addEventListener('pointermove', event => { if (drag) position(event.clientX - drag.x, event.clientY - drag.y); });
      header.addEventListener('pointerup', () => { drag = null; });
      header.addEventListener('pointercancel', () => { drag = null; });
      panel.addEventListener('pointerdown', () => { panel.style.zIndex = String(++layer); });
      panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
      window.addEventListener('resize', () => position(panel.offsetLeft, panel.offsetTop), { signal: request.signal });
      windows.set(target.path, { close, restore() { panel.classList.remove('scratch-tab-minimized'); panel.style.zIndex = String(++layer); content.focus(); } });
      content.focus();
      fetch(target.download, { signal: request.signal, credentials: 'same-origin' }).then(readText).then(text => {
        content.value = text; status.textContent = `Read only · UTF-8 · ${text.split('\n').length} lines`;
      }).catch(error => { if (!request.signal.aborted) { status.textContent = error.message; status.className = 'scratch-tab-error'; } });
    }
    function intercept(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      const target = fileTarget(anchor.href, location.origin, context.chatId);
      if (!target) return;
      event.preventDefault(); event.stopImmediatePropagation();
      chooser?.close();
      chooser = remote.ui.openPopup({ title: `Open ${target.name}`, width: 360, mount(body) {
        body.classList.add('scratch-tab-choice');
        const description = document.createElement('p'); description.textContent = 'Choose how to open this file.'; body.append(description);
        button('Scratch Tab · quick look', () => { chooser.close(); open(target); }, body);
        button('Code Server · full editor', () => { chooser.close(); launchIde(target); }, body);
      } });
    }
    document.addEventListener('click', intercept, { capture: true, signal: lifetime.signal });
    const mark = button('Scratch Tab', () => {
      const recent = [...windows.values()].at(-1);
      if (recent) recent.restore();
      else chooser = remote.ui.openPopup({ title: 'Scratch Tab', html: '<p>Click a workspace file link in this chat, then choose Scratch Tab.</p>' });
    }, host);
    mark.title = 'Restore Scratch Tab or show help'; mark.className = 'scratch-tab-launcher';
    return () => { lifetime.abort(); chooser?.close(); for (const item of [...windows.values()]) item.close(); };
  });
}
