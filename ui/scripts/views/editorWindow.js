import { createSyntaxSurface } from './syntax.js';

export function createEditorWindow({ target, index, button, signal, nextLayer, onClose, onSave, onOpenIde, onEdit, onActivate, onSeparate, onStateChange }) {
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
  red.setAttribute('aria-label', 'Close window');
  red.title = 'Close window';
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
  const syntax = createSyntaxSurface(content, target.name, signal);
  const status = document.createElement('footer');
  status.textContent = 'Loading…';
  status.setAttribute('role', 'status');
  const tabBar = document.createElement('div');
  tabBar.className = 'scratch-tab-tabbar';
  tabBar.hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'scratch-tab-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Open files');
  tabBar.append(tabs);
  const separate = button('Separate window', () => onSeparate?.(), tabBar);
  separate.className = 'scratch-tab-separate';
  panel.append(header, tabBar, syntax.element, status);
  document.body.append(panel);

  const compact = matchMedia('(max-width: 600px), (pointer: coarse) and (max-height: 500px)');
  function position(x, y) {
    header.setAttribute('aria-label', compact.matches ? 'File window title bar' : 'File window title bar. Use arrow keys to reposition.');
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? innerWidth;
    const height = viewport?.height ?? innerHeight;
    panel.style.setProperty('--scratch-viewport-width', `${width}px`);
    panel.style.setProperty('--scratch-viewport-height', `${height}px`);
    panel.style.left = `${compact.matches ? left + 8 : Math.max(left + 8, Math.min(x, left + width - panel.offsetWidth - 8))}px`;
    panel.style.top = `${compact.matches ? top + 8 : Math.max(top + 8, Math.min(y, top + height - panel.offsetHeight - 8))}px`;
  }
  const fitViewport = () => { if (panel.style.display !== 'none') position(panel.offsetLeft, panel.offsetTop); };
  fitViewport();
  let drag;
  header.addEventListener('pointerdown', event => {
    if (compact.matches || event.button !== 0 || event.target.closest('button')) return;
    drag = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove', event => { if (drag) position(event.clientX - drag.x, event.clientY - drag.y); });
  header.addEventListener('pointerup', () => { drag = null; });
  header.addEventListener('pointercancel', () => { drag = null; });
  panel.addEventListener('pointerdown', () => { onActivate?.(); panel.style.zIndex = String(nextLayer()); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } });
  content.addEventListener('input', () => onEdit(content.value));
  panel.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); onSave(); }
  });
  window.addEventListener('resize', fitViewport, { signal });
  window.visualViewport?.addEventListener('resize', fitViewport, { signal });
  window.visualViewport?.addEventListener('scroll', fitViewport, { signal });
  compact.addEventListener('change', fitViewport, { signal });
  // Let phone users read first; tapping the text area opens the keyboard.
  let unsupported;
  const focus = () => { if (panel.style.display !== 'none') (unsupported ? unsupported.querySelector('a') : compact.matches ? header : content).focus({ preventScroll: true }); };

  return {
    setTabs(entries, activePath) {
      tabBar.hidden = false;
      separate.disabled = entries.length < 2;
      const focused = tabs.contains(document.activeElement) ? { path: document.activeElement.dataset.path, close: document.activeElement.classList.contains('scratch-tab-tab-close') } : null;
      const scroll = tabs.scrollLeft;
      tabs.replaceChildren();
      for (const [index, entry] of entries.entries()) {
        const entryHost = document.createElement('div');
        entryHost.className = 'scratch-tab-tab';
        entryHost.setAttribute('role', 'presentation');
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.textContent = `${entry.dirty ? '● ' : ''}${entry.name}`;
        tab.title = entry.path;
        tab.dataset.path = entry.path;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(entry.path === activePath));
        tab.tabIndex = entry.path === activePath ? 0 : -1;
        tab.addEventListener('click', entry.select);
        tab.addEventListener('keydown', event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % entries.length
            : event.key === 'ArrowLeft' ? (index + entries.length - 1) % entries.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          entries[next].select();
        });
        entryHost.append(tab);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'scratch-tab-tab-close';
        close.textContent = '×';
        close.dataset.path = entry.path;
        close.setAttribute('aria-label', `Close tab ${entry.name}`);
        close.title = `Close tab ${entry.name}`;
        close.addEventListener('click', entry.close);
        entryHost.append(close);
        tabs.append(entryHost);
      }
      tabs.scrollLeft = scroll;
      if (focused) [...tabs.querySelectorAll('button')].find(tab => tab.dataset.path === focused.path && tab.classList.contains('scratch-tab-tab-close') === focused.close)?.focus({ preventScroll: true });
    },
    focusTab() {
      const selected = tabs.querySelector('[aria-selected="true"]');
      selected?.focus({ preventScroll: true });
      selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    setVisible(visible) { panel.style.display = visible ? '' : 'none'; if (visible) fitViewport(); },
    copyGeometry(other) {
      for (const property of ['left', 'top', 'width', 'height']) panel.style[property] = other.geometry[property];
    },
    get geometry() { return { left: panel.style.left, top: panel.style.top, width: panel.style.width, height: panel.style.height }; },
    offset() { position(panel.offsetLeft + 24, panel.offsetTop + 24); },
    refreshLinks() { if (unsupported) unsupported.querySelector('a').href = target.download; },
    get text() { return content.value; },
    setText(text) { content.value = text; syntax.refresh(); },
    allowEditing() { content.readOnly = false; },
    showUnsupported() {
      if (!unsupported) {
        unsupported = document.createElement('div');
        unsupported.className = 'scratch-tab-unsupported';
        const message = document.createElement('div');
        message.setAttribute('role', 'status');
        const heading = document.createElement('h2');
        heading.textContent = 'File not supported';
        const description = document.createElement('p');
        description.textContent = 'Scratch Tab can only edit small UTF-8 text files. Download this file to open it in another app.';
        const download = document.createElement('a');
        download.href = target.download;
        download.download = target.name;
        download.textContent = 'Download file';
        message.append(heading, description);
        unsupported.append(message, download);
        syntax.dispose();
        syntax.element.replaceWith(unsupported);
        actions.hidden = true;
        actions.style.display = 'none';
        status.hidden = true;
      }
      focus();
    },
    render({ canSave, dirty }) {
      saveButton.disabled = !canSave;
      title.textContent = `${dirty ? '● ' : ''}${target.name}`;
      onStateChange?.();
    },
    setStatus(text) { status.textContent = text; },
    setError(failed) { status.className = failed ? 'scratch-tab-error' : ''; },
    focus,
    restore() { onActivate?.(); panel.style.zIndex = String(nextLayer()); focus(); },
    remove() { syntax.dispose(); panel.remove(); },
  };
}
