import { UNSUPPORTED_DOCUMENT } from '../config/editor.js';

// Connects document intent/state to a view without owning save policy or DOM layout.
export function mountEditor({ documentModel, createView, onClosed, launchIde, target }) {
  const previous = document.activeElement;
  const request = new AbortController();
  const view = createView({
    signal: request.signal,
    onClose: () => close(),
    onSave: () => void save(),
    onOpenIde: () => launchIde(target),
    onEdit: text => {
      documentModel.edit(text);
      refresh();
      documentModel.remember();
      view.setStatus(documentModel.dirty ? 'Unsaved changes' : 'No changes');
    },
  });
  function refresh() { view.render({ canSave: documentModel.canSave, dirty: documentModel.dirty }); }
  function close(force = false) {
    if (!force && documentModel.dirty && !confirm('Discard unsaved changes to this file?')) return;
    if (force) documentModel.remember(); else documentModel.discardDraft();
    request.abort();
    view.remove();
    onClosed();
    previous?.focus();
  }
  async function save() {
    const command = documentModel.beginSave();
    if (command.kind === 'idle') return;
    if (command.kind === 'too-large') { view.setStatus('File exceeds the 128 KiB save limit.'); return; }
    refresh();
    view.setStatus('Saving…');
    try {
      await documentModel.commitSave(command);
      view.setStatus(documentModel.dirty ? 'Saved earlier changes · Unsaved edits remain' : 'Saved · UTF-8');
      view.setError(false);
    } catch (error) {
      view.setStatus(error.message);
      view.setError(true);
    } finally {
      documentModel.finishSave();
      refresh();
    }
  }
  window.addEventListener('beforeunload', event => {
    if (documentModel.dirty) { event.preventDefault(); event.returnValue = ''; }
  }, { signal: request.signal });
  return {
    close,
    restore: () => view.restore(),
    start() {
      if (UNSUPPORTED_DOCUMENT.test(target.name)) { view.showUnsupported(); return; }
      view.focus();
      documentModel.read().then(result => {
        if (request.signal.aborted) return;
        view.setText(result.content);
        const restored = documentModel.load(result, view.text);
        if (restored) view.setText(documentModel.text);
        view.allowEditing();
        refresh();
        view.setStatus(restored ? 'Restored unsaved draft · Save to write to disk' : 'UTF-8 · Ctrl/Cmd+S to save');
      }).catch(error => {
        if (request.signal.aborted) return;
        if (error.message === 'Only UTF-8 text files up to 128 KiB are supported.') {
          view.showUnsupported();
        } else { view.setStatus(error.message); view.setError(true); }
      });
    },
  };
}
