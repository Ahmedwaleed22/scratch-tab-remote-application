import { MAX_FILE_BYTES } from '../config/editor.js';

export function openEditor(target, { context, drafts, windows, lifetime, callFile, launchIde, nextLayer, button }) {
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
  panel.style.zIndex = String(nextLayer());
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
  panel.addEventListener('pointerdown', () => { panel.style.zIndex = String(nextLayer()); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  function refresh() {
    saveButton.disabled = !loaded || saving || !dirty();
    title.textContent = `${dirty() ? '● ' : ''}${target.name}`;
  }
  async function save() {
    if (!loaded || saving || !dirty()) return;
    const snapshot = content.value;
    const diskText = crlf ? snapshot.replace(/\n/g, '\r\n') : snapshot;
    if (new TextEncoder().encode(diskText).length > MAX_FILE_BYTES) { status.textContent = 'File exceeds the 128 KiB save limit.'; return; }
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
  windows.set(target.path, { close, dirty, restore() { panel.style.zIndex = String(nextLayer()); content.focus(); } });
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
