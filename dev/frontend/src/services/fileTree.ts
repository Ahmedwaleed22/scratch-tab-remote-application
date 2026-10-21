import type { Directories, DirectoryEntry } from '../types.js';
import type { FileTree } from '../port/files/inbound/tree.js';
import { FileTreeState } from '../state/fileTree.js';

interface Dependencies {
  directories: Directories;
  chatId: string;
  preference: { read(): boolean; write(open: boolean): void };
}

const byFoldersThenName = (left: DirectoryEntry, right: DirectoryEntry): number =>
  Number(right.isDir) - Number(left.isDir) ||
  left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });

// Loads one folder level at a time, like Remote's file manager.
export function createFileTree({ directories, chatId, preference }: Dependencies): FileTree {
  const state = new FileTreeState(preference.read());
  const lifetime = new AbortController();
  // Only the latest request for a folder may publish, so refreshes cannot be overtaken.
  const requests = new Map<string, number>();
  let sequence = 0;
  function load(path: string): void {
    const request = ++sequence;
    requests.set(path, request);
    state.loading(path);
    directories
      .list(chatId, path, lifetime.signal)
      .then(entries => {
        if (requests.get(path) === request)
          state.loaded(path, [...entries].sort(byFoldersThenName));
      })
      .catch((error: unknown) => {
        if (lifetime.signal.aborted || requests.get(path) !== request) return;
        state.failed(path, error instanceof Error ? error.message : String(error));
      });
  }
  const visible = () => state.snapshot.open || state.snapshot.drawerOpen;
  function refresh(): void {
    if (!visible()) return;
    for (const path of ['', ...state.snapshot.expanded]) load(path);
  }
  return {
    get snapshot() {
      return state.snapshot;
    },
    subscribe: listener => state.subscribe(listener),
    setOpen(open, compact) {
      if (!compact) preference.write(open);
      const wasVisible = visible();
      state.setOpen(open, compact);
      if (open && !wasVisible) refresh();
    },
    toggleFolder(path) {
      if (state.snapshot.expanded.has(path)) {
        state.collapse(path);
        return;
      }
      state.expand([path]);
      if (!state.snapshot.children.has(path)) load(path);
    },
    reveal(path) {
      if (!path.startsWith('/workspace/')) return;
      const parts = path.slice('/workspace/'.length).split('/').slice(0, -1);
      const folders = parts.map((_, index) => parts.slice(0, index + 1).join('/'));
      state.expand(folders);
      if (!visible()) return;
      for (const folder of ['', ...folders])
        if (!state.snapshot.children.has(folder) && !state.snapshot.loading.has(folder))
          load(folder);
    },
    refresh,
    downloadUrl: relative =>
      `/api/chats/${encodeURIComponent(chatId)}/files/download?path=${encodeURIComponent(relative)}`,
    setChat(next) {
      chatId = next;
    },
    dispose() {
      lifetime.abort();
    },
  };
}
