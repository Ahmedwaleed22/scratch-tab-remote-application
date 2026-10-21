import type { DirectoryEntry } from '../model/files/application/directory.js';
import { useLayoutEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { FileTree } from '../port/files/inbound/tree.js';
import type { FileSidebarProps } from '../components/FileSidebar.js';
import { WINDOW_LAYOUT } from '../config/windowLayout.js';

export interface FileSidebarController {
  visible: boolean;
  toggle(): void;
  props: FileSidebarProps;
}

// Hooks run unconditionally; a window without a tree gets no sidebar.
export function useFileSidebar(
  tree: FileTree | undefined,
  activePath: string,
  onOpenFile: ((entry: DirectoryEntry) => void) | undefined,
): FileSidebarController | null {
  const treeRef = useRef<HTMLDivElement>(null);
  const [refreshRequested, setRefreshRequested] = useState(false);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const [compact, setCompact] = useState(() => matchMedia(WINDOW_LAYOUT.compactQuery).matches);
  useLayoutEffect(() => tree?.subscribe(() => refresh(0)), [tree]);
  useLayoutEffect(() => {
    const query = matchMedia(WINDOW_LAYOUT.compactQuery);
    const change = () => setCompact(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const snapshot = tree?.snapshot;
  const visible = Boolean(compact ? snapshot?.drawerOpen : snapshot?.open);
  const busy = Boolean(snapshot && snapshot.loading.size > 0);
  const refreshStatus = !refreshRequested
    ? ''
    : busy
      ? 'Refreshing…'
      : snapshot?.errors.size
        ? 'Refresh failed. Try again.'
        : 'Files refreshed.';
  useLayoutEffect(() => {
    if (!visible) return;
    treeRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [visible, activePath, snapshot?.children, snapshot?.expanded]);
  useLayoutEffect(() => {
    if (visible) tree?.reveal(activePath);
  }, [tree, visible, activePath]);
  if (!tree || !snapshot || !onOpenFile) return null;
  return {
    visible,
    toggle: () => tree.setOpen(!visible, compact),
    props: {
      snapshot,
      activePath,
      visible,
      treeRef,
      busy,
      refreshStatus,
      downloadUrl: entry => tree.downloadUrl(entry.path),
      onToggleFolder: entry => tree.toggleFolder(entry.path),
      onRefresh() {
        setRefreshRequested(true);
        tree.refresh();
      },
      onOpenFile(entry) {
        onOpenFile(entry);
        // The phone drawer covers the editor, so get it out of the way.
        if (compact) tree.setOpen(false, true);
      },
    },
  };
}
