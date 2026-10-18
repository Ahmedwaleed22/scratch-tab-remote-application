import { FIRST_WINDOW_LAYER } from '../config/editor.js';
import { captureFileOpenings } from '../adapters/fileOpenings.js';
import { openChooser } from '../views/chooser.js';
import { openEditor } from '../presenters/editor.js';

export function mountChat({ context, drafts, callFile, launchIde }) {
  const lifetime = new AbortController();
  const windows = new Map();
  let chooser;
  let layer = FIRST_WINDOW_LAYER;
  const nextLayer = () => ++layer;
  function button(label, action, parent) {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = label;
    node.addEventListener('click', action, { signal: lifetime.signal });
    parent.append(node); return node;
  }
  const open = target => openEditor(target, { context, drafts, windows, lifetime, callFile, launchIde, nextLayer, button });
  captureFileOpenings(context, lifetime.signal, (anchor, target) => {
    chooser?.close();
    chooser = openChooser({ anchor, target, button, nextLayer, onScratch: open, onCode: launchIde });
  });
  return () => { lifetime.abort(); chooser?.close(); for (const item of [...windows.values()]) item.close(true); };
}
