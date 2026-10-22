import type { Directories } from '../port/files/outbound/directories.js';
import type { ChatContext, Drafts, Files, FileTarget } from '../types.js';
import type { EditorWindowView } from '../port/editor/outbound/view.js';
interface Group {
  items: Map<string, Item>;
  active: string | null;
}
interface Item {
  target: FileTarget;
  documentModel: EditorDocument;
  group: Group;
  window: EditorWindowView;
}
import { windowGeometry } from '../adapters/windowGeometry.js';
import { FIRST_WINDOW_LAYER } from '../config/editor.js';
import { captureFileOpenings } from '../adapters/fileOpenings.js';
import { mountEditorWindow } from './editor.js';
import { EditorDocument } from '../services/editorDocument.js';
import { createFileTree } from '../services/fileTree.js';
import { FileTreeState } from '../state/fileTree.js';
import { sidebarPreference } from '../adapters/sidebarPreference.js';
import { createDirectories } from '../api/directories.js';
import { fileTarget } from '../links.js';

export interface ChatSession {
  (): void;
  setContext(context: ChatContext): void;
  suspend(): void;
}

export function mountChat({
  context,
  drafts,
  files,
  directories = createDirectories(),
  launchIde,
  canLaunchIde,
}: {
  context: ChatContext;
  drafts: Drafts;
  files: Files;
  directories?: Directories;
  launchIde(target: FileTarget): void;
  canLaunchIde?(target: FileTarget): boolean;
}): ChatSession {
  // One tree per project session, shared by every window's sidebar.
  const fileTree = createFileTree({
    directories,
    chatId: context.chatId,
    preference: sidebarPreference,
    state: new FileTreeState(sidebarPreference.read()),
  });
  const windows = new Map<string, Item>();
  let layer = FIRST_WINDOW_LAYER;
  const nextLayer = () => ++layer;
  let activeGroup: Group | undefined;
  function renderGroup(group: Group) {
    const tabs = [...group.items.values()].map(item => ({
      path: item.target.path,
      name: item.target.name,
      dirty: item.documentModel.dirty,
      select: () => {
        item.window.restore();
        item.window.focusTab();
      },
      close: () => item.window.close(),
    }));
    for (const item of group.items.values()) item.window.setTabs(tabs, group.active);
  }
  function activate(item: Item) {
    const group = item.group;
    const previous = group.items.get(group.active ?? '');
    if (previous && previous !== item) item.window.copyGeometry(previous.window);
    group.active = item.target.path;
    activeGroup = group;
    for (const entry of group.items.values()) entry.window.setVisible(entry === item);
    renderGroup(group);
  }
  function separate(item: Item) {
    const group = item.group;
    if (group.items.size < 2) return;
    group.items.delete(item.target.path);
    group.active = group.items.keys().next().value ?? null;
    activate(group.items.get(group.active ?? '')!);
    item.group = { items: new Map([[item.target.path, item]]), active: item.target.path };
    activate(item);
    item.window.offset();
    item.window.restore();
  }
  function closeGroup(group: Group) {
    const items = [...group.items.values()];
    if (
      items.some(item => item.documentModel.dirty) &&
      !confirm('Discard unsaved changes and close all tabs in this window?')
    )
      return;
    for (const item of items) item.window.close(false, true);
  }
  function open(target: FileTarget, into?: Group) {
    const existing = windows.get(target.path);
    if (existing) {
      existing.window.restore();
      return;
    }
    const group = into?.items.size
      ? into
      : activeGroup?.items.size
        ? activeGroup
        : { items: new Map(), active: null };
    const documentModel = new EditorDocument(
      target.path,
      `${context.projectId}:${target.path}`,
      drafts,
      files,
    );
    const item: Item = {
      target,
      documentModel,
      group,
      get window() {
        return windowView;
      },
    };
    const windowView = mountEditorWindow({
      target,
      documentModel,
      launchIde,
      canLaunchIde,
      onClosed: () => {
        windows.delete(target.path);
        // A tab may have moved since it was opened.
        item.group.items.delete(target.path);
        if (item.group.items.size) {
          const next =
            item.group.items.get(item.group.active ?? '') || item.group.items.values().next().value;
          activate(next!);
          next!.window.restore();
        } else if (activeGroup === item.group) activeGroup = windows.values().next().value?.group;
      },
      index: windows.size,
      layoutPersistence: windowGeometry(context.projectId),
      nextLayer,
      onClose: () => closeGroup(item.group),
      onActivate: () => {
        if (item.group.active !== item.target.path) activate(item);
        else activeGroup = item.group;
      },
      onSeparate: () => separate(item),
      onStateChange: () => renderGroup(item.group),
      fileTree,
      onOpenFile(entry) {
        const opened = fileTarget(
          `/api/chats/${encodeURIComponent(context.chatId)}/ide-open?scratch=1&path=${encodeURIComponent('/workspace/' + entry.path)}`,
          location.origin,
          context.chatId,
          context.cwd,
        );
        // Sidebar files join the window they were picked from.
        if (opened) open(opened, item.group);
      },
    });
    group.items.set(target.path, item);
    windows.set(target.path, item);
    activate(item);
  }
  let capture: AbortController | undefined;
  function suspend() {
    capture?.abort();
    for (const item of windows.values()) item.window.setVisible(false);
  }
  function setContext(next: ChatContext) {
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
        item.window.refreshLinks();
      }
    }
    context = next;
    fileTree.setChat(next.chatId);
    for (const item of windows.values())
      item.window.setVisible(item.group.active === item.target.path);
    capture = new AbortController();
    captureFileOpenings(context, capture.signal, (_anchor, target) => open(target));
  }
  setContext(context);
  const dispose = () => {
    suspend();
    for (const item of [...windows.values()]) item.window.close(true);
    fileTree.dispose();
  };
  dispose.setContext = setContext;
  dispose.suspend = suspend;
  return dispose;
}
