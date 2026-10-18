import { FIRST_WINDOW_LAYER } from '../config/editor.js';
import { captureFileOpenings } from '../adapters/fileOpenings.js';
import { openChooser } from '../views/chooser.js';
import { mountEditor } from '../presenters/editor.js';
import { createEditorWindow } from '../views/editorWindow.js';
import { createButton } from '../views/button.js';
import { EditorDocument } from '../services/editorDocument.js';

export function mountChat({ context, drafts, files, launchIde }) {
  const lifetime = new AbortController();
  const windows = new Map();
  let chooser;
  let layer = FIRST_WINDOW_LAYER;
  const nextLayer = () => ++layer;
  const button = (label, action, parent) => createButton(label, action, parent, lifetime.signal);
  function open(target) {
    const existing = windows.get(target.path);
    if (existing) { existing.restore(); return; }
    const documentModel = new EditorDocument(target.path, `${context.projectId}:${target.path}`, drafts, files);
    const editor = mountEditor({
      target,
      documentModel,
      launchIde,
      onClosed: () => windows.delete(target.path),
      createView: handlers => createEditorWindow({ target, index: windows.size, button, nextLayer, ...handlers }),
    });
    windows.set(target.path, editor);
    editor.start();
  }
  captureFileOpenings(context, lifetime.signal, (anchor, target) => {
    chooser?.close();
    chooser = openChooser({ anchor, target, button, nextLayer, onScratch: open, onCode: launchIde });
  });
  return () => { lifetime.abort(); chooser?.close(); for (const item of [...windows.values()]) item.close(true); };
}
