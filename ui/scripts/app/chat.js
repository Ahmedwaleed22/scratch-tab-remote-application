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
  let activeGroup;
  function renderGroup(group) {
    const tabs = [...group.items.values()].map(item => ({
      path: item.target.path, name: item.target.name, dirty: item.documentModel.dirty,
      select: () => { item.editor.restore(); item.view.focusTab(); },
    }));
    for (const item of group.items.values()) item.view.setTabs(tabs, group.active);
  }
  function activate(item) {
    const group = item.group;
    const previous = group.items.get(group.active);
    if (previous && previous !== item) item.view.copyGeometry(previous.view);
    group.active = item.target.path;
    activeGroup = group;
    for (const entry of group.items.values()) entry.view.setVisible(entry === item);
    renderGroup(group);
  }
  function separate(item) {
    const group = item.group;
    if (group.items.size < 2) return;
    group.items.delete(item.target.path);
    group.active = group.items.keys().next().value;
    activate(group.items.get(group.active));
    item.group = { items: new Map([[item.target.path, item]]), active: item.target.path };
    activate(item);
    item.view.offset();
    item.editor.restore();
  }
  function open(target) {
    const existing = windows.get(target.path);
    if (existing) { existing.editor.restore(); return; }
    const group = activeGroup?.items.size ? activeGroup : { items: new Map(), active: null };
    const documentModel = new EditorDocument(target.path, `${context.projectId}:${target.path}`, drafts, files);
    const item = { target, documentModel, group };
    const editor = mountEditor({
      target,
      documentModel,
      launchIde,
      onClosed: () => {
        windows.delete(target.path);
        // A tab may have moved since it was opened.
        item.group.items.delete(target.path);
        if (item.group.items.size) {
          const next = item.group.items.get(item.group.active) || item.group.items.values().next().value;
          activate(next);
          next.editor.restore();
        } else if (activeGroup === item.group) activeGroup = windows.values().next().value?.group;
      },
      createView: handlers => {
        item.view = createEditorWindow({ target, index: windows.size, button, nextLayer, ...handlers,
          onActivate: () => { if (item.group.active !== item.target.path) activate(item); else activeGroup = item.group; }, onSeparate: () => separate(item), onStateChange: () => renderGroup(item.group),
        });
        return item.view;
      },
    });
    item.editor = editor;
    group.items.set(target.path, item);
    windows.set(target.path, item);
    activate(item);
    editor.start();
  }
  captureFileOpenings(context, lifetime.signal, (anchor, target) => {
    chooser?.close();
    chooser = openChooser({ anchor, target, button, nextLayer, onScratch: open, onCode: launchIde });
  });
  return () => { lifetime.abort(); chooser?.close(); for (const item of [...windows.values()]) item.editor.close(true); };
}
