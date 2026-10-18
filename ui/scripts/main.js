const LIMIT = 128 * 1024;
const drafts = new Map();

export function fileTarget(href, origin, chatId, cwd = '') {
  try {
    const url = new URL(href, origin);
    const base = new URL(origin);
    const project = /^\/var\/lib\/remote\/projects\/([a-z0-9][a-z0-9-]*)\/workspace(?:\/|$)/.exec(cwd);
    let raw;
    if (url.origin === origin && url.pathname === `/api/chats/${encodeURIComponent(chatId)}/ide-open`) {
      raw = url.searchParams.get('path') || '';
    } else if (project && url.protocol === base.protocol && url.port === base.port &&
      ((url.hostname === `code--${project[1]}.${base.hostname}` &&
        (url.pathname === '/_static/remote-open.html' || url.pathname === '/')) ||
       (url.hostname === `code.${base.hostname}` && url.pathname === `/${project[1]}/`))) {
      raw = url.searchParams.get('file');
      if (!raw) {
        const payload = JSON.parse(url.searchParams.get('payload') || '[]');
        if (!Array.isArray(payload)) return null;
        const file = payload.find(pair => Array.isArray(pair) && pair[0] === 'openFile')?.[1];
        if (typeof file !== 'string') return null;
        const uri = new URL(file);
        if (uri.protocol !== 'vscode-remote:' || uri.host !== url.host) return null;
        raw = decodeURIComponent(uri.pathname);
      }
    } else return null;
    let path = raw.replace(/(:\d+){1,2}$/, '');
    // Older links can contain host paths; translate only this project's workspace.
    if (project) {
      const hostRoot = `/var/lib/remote/projects/${project[1]}/workspace/`;
      if (path.startsWith(hostRoot)) path = `/workspace/${path.slice(hostRoot.length)}`;
    }
    if (!path.startsWith('/workspace/') || path.endsWith('/')) return null;
    const relative = path.slice('/workspace/'.length);
    if (relative.split('/').some(part => part === '..' || part === '.' || part === '') || path.includes('\0')) return null;
    return { path, name: path.split('/').pop(), ide: url.href,
      download: `/api/chats/${encodeURIComponent(chatId)}/files/download?path=${encodeURIComponent(relative)}` };
  } catch { return null; }
}

export default function activate(remote) {
  remote.ui.register(remote.slots.chatHeaderActions, (host, context) => {
    if (!context.chatId) return;
    const lifetime = new AbortController();
    const windows = new Map();
    let chooser;
    let layer = 200;
    const callFile = body => remote.backend.call('file', { projectId: context.projectId, method: 'POST', body });
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
      const draftKey = `${context.projectId}:${target.path}`;
      let baseline = '', revision = '', saving = false, loaded = false, crlf = false;
      const dirty = () => loaded && content.value !== baseline;
      const remember = () => { if (!loaded) return; if (dirty()) drafts.set(draftKey, { content: content.value, baseline, revision, crlf }); else drafts.delete(draftKey); };
      const close = (force = false) => {
        if (!force && dirty() && !confirm('Discard unsaved changes to this file?')) return;
        if (force) remember(); else drafts.delete(draftKey);
        request.abort(); panel.remove(); windows.delete(target.path); previous?.focus();
      };
      const red = button('×', () => close(), controls); red.setAttribute('aria-label', 'Close file');
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
      const saveButton = button('Save', () => void save(), toolbar);
      saveButton.disabled = true;
      button('Open in Code Server ↗', () => launchIde(target), toolbar);
      button('About', () => {
        chooser?.close();
        chooser = remote.ui.openPopup({ title: 'About Scratch Tab', html: '<p>Copyright © 2026 Pixlotech. Licensed under AGPL-3.0-or-later. Provided without warranty.</p><p><a href="https://github.com/Ahmedwaleed22/Scratch-tab-remote-application" target="_blank" rel="noopener noreferrer">Source code</a> · <a href="https://github.com/Ahmedwaleed22/Scratch-tab-remote-application/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">License</a></p>' });
      }, toolbar);
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
      function refresh() {
        saveButton.disabled = !loaded || saving || !dirty();
        title.textContent = `${dirty() ? '● ' : ''}${target.name}`;
      }
      async function save() {
        if (!loaded || saving || !dirty()) return;
        const snapshot = content.value;
        const diskText = crlf ? snapshot.replace(/\n/g, '\r\n') : snapshot;
        if (new TextEncoder().encode(diskText).length > LIMIT) { status.textContent = 'File exceeds the 128 KiB save limit.'; return; }
        saving = true; refresh(); status.textContent = 'Saving…';
        try {
          const result = await callFile({ path: target.path, content: diskText, revision, save: true });
          revision = result.revision; baseline = snapshot; remember();
          status.textContent = dirty() ? 'Saved earlier changes · Unsaved edits remain' : 'Saved · UTF-8'; status.className = '';
        } catch (error) { status.textContent = error.message; status.className = 'scratch-tab-error'; }
        finally { saving = false; refresh(); }
      }
      content.addEventListener('input', () => { refresh(); remember(); status.textContent = dirty() ? 'Unsaved changes' : 'No changes'; });
      panel.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
      });
      window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } }, { signal: request.signal });
      window.addEventListener('resize', () => position(panel.offsetLeft, panel.offsetTop), { signal: request.signal });
      windows.set(target.path, { close, dirty, restore() { panel.classList.remove('scratch-tab-minimized'); panel.style.zIndex = String(++layer); content.focus(); } });
      content.focus();
      callFile({ path: target.path }).then(result => {
        if (request.signal.aborted) return;
        crlf = result.content.includes('\r\n');
        content.value = result.content; baseline = content.value; revision = result.revision;
        const draft = drafts.get(draftKey);
        if (draft) { content.value = draft.content; baseline = draft.baseline; revision = draft.revision; crlf = draft.crlf; }
        loaded = true; content.readOnly = false; refresh();
        status.textContent = draft ? 'Restored unsaved draft · Save to write to disk' : 'UTF-8 · Ctrl/Cmd+S to save';
      }).catch(error => { if (!request.signal.aborted) { status.textContent = error.message; status.className = 'scratch-tab-error'; } });
    }
    function intercept(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      const target = fileTarget(anchor.href, location.origin, context.chatId, context.cwd);
      if (!target) return;
      event.preventDefault(); event.stopImmediatePropagation();
      chooser?.close();
      chooser = remote.ui.openPopup({ title: `Open ${target.name}`, width: 360, mount(body) {
        body.classList.add('scratch-tab-choice');
        const description = document.createElement('p'); description.textContent = 'Choose how to open this file.'; body.append(description);
        button('Scratch Tab · lightweight editor', () => { chooser.close(); open(target); }, body);
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
    return () => { lifetime.abort(); chooser?.close(); for (const item of [...windows.values()]) item.close(true); };
  });
}
