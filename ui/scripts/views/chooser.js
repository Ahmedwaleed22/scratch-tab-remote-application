export function openChooser({ anchor, target, button, nextLayer, onScratch, onCode }) {
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
  const scratch = button('Scratch Tab', () => { handle.close(); onScratch(target); }, menu);
  const code = button('Code Server', () => { handle.close(); onCode(target); }, menu);
  document.body.append(menu);
  const bounds = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${bounds.bottom + 8 + menu.offsetHeight <= innerHeight - 8 ? bounds.bottom + 8 : Math.max(8, bounds.top - menu.offsetHeight - 8)}px`;
  menu.style.zIndex = String(nextLayer());
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

  return handle;
}
