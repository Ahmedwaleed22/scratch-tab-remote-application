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
      path: item.target.path,
      name: item.target.name,
      dirty: item.documentModel.dirty,
      select: () => {
        item.editor.restore();
        item.view.focusTab();
      },
      close: () => item.editor.close(),
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
  function closeGroup(group) {
    const items = [...group.items.values()];
    if (
      items.some(item => item.documentModel.dirty) &&
      !confirm('Discard unsaved changes and close all tabs in this window?')
    )
      return;
    for (const item of items) item.editor.close(false, true);
  }
  function open(target) {
    const existing = windows.get(target.path);
    if (existing) {
      existing.editor.restore();
      return;
    }
    const group = activeGroup?.items.size ? activeGroup : { items: new Map(), active: null };
    const documentModel = new EditorDocument(
      target.path,
      `${context.projectId}:${target.path}`,
      drafts,
      files,
    );
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
          const next =
            item.group.items.get(item.group.active) || item.group.items.values().next().value;
          activate(next);
          next.editor.restore();
        } else if (activeGroup === item.group) activeGroup = windows.values().next().value?.group;
      },
      createView: handlers => {
        item.view = createEditorWindow({
          target,
          index: windows.size,
          button,
          nextLayer,
          ...handlers,
          onClose: () => closeGroup(item.group),
          onActivate: () => {
            if (item.group.active !== item.target.path) activate(item);
            else activeGroup = item.group;
          },
          onSeparate: () => separate(item),
          onStateChange: () => renderGroup(item.group),
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
  let capture;
  function suspend() {
    capture?.abort();
    chooser?.close();
    chooser = null;
    for (const item of windows.values()) item.view.setVisible(false);
  }
  function setContext(next) {
    suspend();
    if (next.chatId !== context.chatId) {
      for (const item of windows.values()) {
        const relative = item.target.path.slice('/workspace/'.length);
        item.target.download = `/api/chats/${encodeURIComponent(next.chatId)}/files/download?path=${encodeURIComponent(relative)}`;
        const ide = new URL(item.target.ide, location.origin);
        if (
          ide.origin === location.origin &&
          ide.pathname === `/api/chats/${encodeURIComponent(context.chatId)}/ide-open`
        ) {
          ide.pathname = `/api/chats/${encodeURIComponent(next.chatId)}/ide-open`;
          item.target.ide = ide.href;
        }
        // File-manager row callbacks belong to the old chat's DOM.
        delete item.target.openIde;
        item.view.refreshLinks();
      }
    }
    context = next;
    for (const item of windows.values())
      item.view.setVisible(item.group.active === item.target.path);
    capture = new AbortController();
    captureFileOpenings(context, capture.signal, (anchor, target) => {
      chooser?.close();
      chooser = openChooser({
        anchor,
        target,
        button,
        nextLayer,
        onScratch: open,
        onCode: launchIde,
      });
    });
  }
  setContext(context);
  const dispose = () => {
    suspend();
    lifetime.abort();
    for (const item of [...windows.values()]) item.editor.close(true);
  };
  dispose.setContext = setContext;
  dispose.suspend = suspend;
  return dispose;
}
