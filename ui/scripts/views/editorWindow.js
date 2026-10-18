export function createEditorWindow({ target, index, button, signal, nextLayer, onClose, onSave, onOpenIde, onEdit }) {
  const panel = document.createElement('section');
  panel.className = 'scratch-tab-window';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', target.name);
  panel.style.left = `${Math.min(48 + index * 24, Math.max(8, innerWidth - 350))}px`;
  panel.style.top = `${Math.min(90 + index * 24, Math.max(8, innerHeight - 200))}px`;
  panel.style.zIndex = String(nextLayer());
  const header = document.createElement('header');
  header.className = 'scratch-tab-header';
  const controls = document.createElement('div');
  controls.className = 'scratch-tab-controls';
  header.append(controls);
  const red = button('', onClose, controls);
  red.setAttribute('aria-label', 'Close file');
  red.title = 'Close file';
  const title = document.createElement('strong');
  title.textContent = target.name;
  title.title = target.path;
  header.append(title);
  header.tabIndex = 0;
  header.setAttribute('role', 'group');
  header.setAttribute('aria-label', 'File window title bar. Use arrow keys to reposition.');
  header.addEventListener('keydown', event => {
    if (event.target !== header) return;
    const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
    if (delta) { event.preventDefault(); position(panel.offsetLeft + delta[0], panel.offsetTop + delta[1]); }
  });
  const actions = document.createElement('div');
  actions.className = 'scratch-tab-actions';
  header.append(actions);
  const saveButton = button('Save', onSave, actions);
  saveButton.disabled = true;
  button('Open in Code Server', onOpenIde, actions);
  const content = document.createElement('textarea');
  content.readOnly = true;
  content.spellcheck = false;
  content.setAttribute('aria-label', `${target.name} file content`);
  const status = document.createElement('footer');
  status.textContent = 'Loading…';
  status.setAttribute('role', 'status');
  panel.append(header, content, status);
  document.body.append(panel);

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
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } });
  content.addEventListener('input', () => onEdit(content.value));
  panel.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); onSave(); }
  });
  window.addEventListener('resize', () => position(panel.offsetLeft, panel.offsetTop), { signal });

  return {
    get text() { return content.value; },
    setText(text) { content.value = text; },
    allowEditing() { content.readOnly = false; },
    render({ canSave, dirty }) {
      saveButton.disabled = !canSave;
      title.textContent = `${dirty ? '● ' : ''}${target.name}`;
    },
    setStatus(text) { status.textContent = text; },
    setError(failed) { status.className = failed ? 'scratch-tab-error' : ''; },
    focus() { content.focus(); },
    restore() { panel.style.zIndex = String(nextLayer()); content.focus(); },
    remove() { panel.remove(); },
  };
}
