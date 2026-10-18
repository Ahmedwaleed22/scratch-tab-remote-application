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
  remote.ui.register(remote.slots.chatHeaderActions, (_host, context) => {
    if (!context.chatId) return;
    const lifetime = new AbortController();
    const windows = new Map();
    let chooser;
    let layer = 200;
    let openingOriginal = false;
    const callFile = body => remote.backend.call('file', { projectId: context.projectId, method: 'POST', body });
    const launchIde = target => target.openIde ? target.openIde() : window.open(target.ide, '_blank', 'noopener,noreferrer');
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
      const red = button('', () => close(), controls); red.setAttribute('aria-label', 'Close file'); red.title = 'Close file';
      const title = document.createElement('strong'); title.textContent = target.name; title.title = target.path; header.append(title);
      header.tabIndex = 0; header.setAttribute('role', 'group');
      header.setAttribute('aria-label', 'File window title bar. Use arrow keys to reposition.');
      header.addEventListener('keydown', event => {
        if (event.target !== header) return;
        const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
        if (delta) { event.preventDefault(); position(panel.offsetLeft + delta[0], panel.offsetTop + delta[1]); }
      });
      const actions = document.createElement('div'); actions.className = 'scratch-tab-actions';
      header.append(actions);
      const saveButton = button('Save', () => void save(), actions);
      saveButton.disabled = true;
      button('Open in Code Server', () => launchIde(target), actions);
      const content = document.createElement('textarea'); content.readOnly = true; content.spellcheck = false;
      content.setAttribute('aria-label', `${target.name} file content`);
      const status = document.createElement('footer'); status.textContent = 'Loading…'; status.setAttribute('role', 'status');
      panel.append(header, content, status); document.body.append(panel);
      function position(x, y) {
        panel.style.left = `${Math.max(0, Math.min(x, innerWidth - Math.min(panel.offsetWidth, 180)))}px`;
        panel.style.top = `${Math.max(0, Math.min(y, innerHeight - 48))}px`;
      }
      let drag;
      header.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button')) return;
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
      windows.set(target.path, { close, dirty, restore() { panel.style.zIndex = String(++layer); content.focus(); } });
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
      if (openingOriginal || event.defaultPrevented || (event.type === 'click' && event.button !== 0) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target : null;
      if (!element) return;
      let anchor = element.closest('a[href]');
      let target = anchor && event.type === 'click' ? fileTarget(anchor.href, location.origin, context.chatId, context.cwd) : null;
      if (!anchor && !element.closest('button,input,textarea,select')) {
        const row = element.closest('[role="button"]');
        if (row?.closest('#workspace-files-pane')) {
          const download = row.querySelector('a[download][href]');
          if (download) {
            const url = new URL(download.href, location.origin);
            const relative = url.searchParams.get('path');
            const mediaOrArchive = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|heic|tiff?|mp4|mov|webm|mkv|avi|m4v|mp3|wav|flac|ogg|m4a|aac|pdf|zip|tar|gz|tgz|rar|7z)$/i;
            if (url.origin === location.origin && url.pathname === `/api/chats/${encodeURIComponent(context.chatId)}/files/download` && relative && !relative.startsWith('/') && !mediaOrArchive.test(relative) && !row.title.startsWith('View ')) {
              target = fileTarget(`/api/chats/${encodeURIComponent(context.chatId)}/ide-open?path=${encodeURIComponent('/workspace/' + relative)}`, location.origin, context.chatId, context.cwd);
              if (target) {
                anchor = row;
                target.openIde = () => {
                  openingOriginal = true;
                  try { row.click(); } finally { openingOriginal = false; }
                };
              }
            }
          }
        }
      }
      if (!target) return;
      event.preventDefault(); event.stopImmediatePropagation();
      chooser?.close();
      const menu = document.createElement('div');
      menu.className = 'scratch-tab-choice';
      menu.setAttribute('role', 'dialog');
      menu.setAttribute('aria-label', `Open ${target.name} with`);
      const dismissal = new AbortController();
      let closed = false;
      const handle = { close(restoreFocus = true) {
        if (closed) return;
        closed = true; dismissal.abort(); menu.remove();
        if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
      } };
      chooser = handle;
      const scratch = button('Scratch Tab', () => { handle.close(); open(target); }, menu);
      const code = button('Code Server', () => { handle.close(); launchIde(target); }, menu);
      document.body.append(menu);
      const bounds = anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${bounds.bottom + 8 + menu.offsetHeight <= innerHeight - 8 ? bounds.bottom + 8 : Math.max(8, bounds.top - menu.offsetHeight - 8)}px`;
      menu.style.zIndex = String(++layer);
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); handle.close(); }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); (document.activeElement === scratch ? code : scratch).focus();
        }
      });
      menu.addEventListener('focusout', event => { if (event.relatedTarget && !menu.contains(event.relatedTarget)) handle.close(false); });
      document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) handle.close(false); }, { capture: true, signal: dismissal.signal });
      window.addEventListener('scroll', () => handle.close(false), { capture: true, signal: dismissal.signal });
      window.addEventListener('resize', () => handle.close(false), { signal: dismissal.signal });
      scratch.focus({ preventScroll: true });
    }
    document.addEventListener('click', intercept, { capture: true, signal: lifetime.signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') intercept(event);
    }, { capture: true, signal: lifetime.signal });
    return () => { lifetime.abort(); chooser?.close(); for (const item of [...windows.values()]) item.close(true); };
  });
}
