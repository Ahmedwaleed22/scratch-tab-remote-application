import type { JSX } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import Button from './Button.js';
import FileIcon from './FileIcon.js';
import type { DirectoryEntry } from '../types.js';
import type { FileTreeSnapshot } from '../model/files/tree.js';
import { MEDIA_OR_ARCHIVE } from '../config/editor.js';

export interface FileSidebarProps {
  snapshot: Readonly<FileTreeSnapshot>;
  /** The /workspace path of the file shown in this window. */
  activePath: string;
  visible: boolean;
  downloadUrl(entry: DirectoryEntry): string;
  onToggleFolder(entry: DirectoryEntry): void;
  onOpenFile(entry: DirectoryEntry): void;
  onRefresh(): void;
}

const icon = (path: string): JSX.Element => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d={path} fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
  </svg>
);
const CHEVRON = 'M6 4l4 4-4 4';
const FOLDER = 'M2 4.5h4l1.5 1.5H14v6.5H2z';
const REFRESH = 'M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5';

export default function FileSidebar(props: FileSidebarProps): JSX.Element {
  const { snapshot, visible, onRefresh } = props;
  const treeRef = useRef<HTMLDivElement>(null);
  const [refreshRequested, setRefreshRequested] = useState(false);
  const busy = snapshot.loading.size > 0;
  const refreshStatus = !refreshRequested
    ? ''
    : busy
      ? 'Refreshing…'
      : snapshot.errors.size
        ? 'Refresh failed. Try again.'
        : 'Files refreshed.';
  useLayoutEffect(() => {
    if (!visible) return;
    treeRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [visible, props.activePath, snapshot.children, snapshot.expanded]);
  return (
    <nav class="scratch-tab-sidebar" aria-label="Workspace files" hidden={!visible}>
      <div class="scratch-tab-sidebar-header">
        <span>Files</span>
        <Button
          aria-label="Refresh files"
          title={busy ? 'Refreshing files…' : 'Refresh files'}
          aria-busy={busy}
          disabled={busy}
          onClick={() => {
            setRefreshRequested(true);
            onRefresh();
          }}
        >
          {icon(REFRESH)}
        </Button>
      </div>
      <div class="scratch-tab-tree" ref={treeRef} aria-busy={busy}>
        <Folder {...props} path="" depth={0} />
      </div>
      <p class="scratch-tab-refresh-status" role="status">
        {refreshStatus}
      </p>
      {snapshot.children.size === 0 && snapshot.loading.has('') && (
        <p class="scratch-tab-tree-note">Loading…</p>
      )}
    </nav>
  );
}

function Folder(props: FileSidebarProps & { path: string; depth: number }): JSX.Element | null {
  const { snapshot, path, depth } = props;
  const error = snapshot.errors.get(path);
  const entries = snapshot.children.get(path);
  const indent = { '--scratch-tree-depth': String(depth) };
  if (error)
    return (
      <p class="scratch-tab-tree-note scratch-tab-error" style={indent}>
        {error}
      </p>
    );
  if (!entries) return null;
  if (!entries.length)
    return (
      <p class="scratch-tab-tree-note" style={indent}>
        Empty folder.
      </p>
    );
  return (
    <ul role="list">
      {entries.map(entry => (
        <li key={entry.path}>
          <Entry {...props} entry={entry} />
        </li>
      ))}
    </ul>
  );
}

function Entry(
  props: FileSidebarProps & { entry: DirectoryEntry; depth: number },
): JSX.Element | null {
  const { entry, depth, snapshot, activePath } = props;
  const indent = { '--scratch-tree-depth': String(depth) };
  if (entry.isDir) {
    const expanded = snapshot.expanded.has(entry.path);
    return (
      <>
        <Button
          class="scratch-tab-tree-row"
          style={indent}
          title={entry.path}
          aria-expanded={expanded}
          aria-busy={snapshot.loading.has(entry.path) || undefined}
          onClick={() => props.onToggleFolder(entry)}
        >
          <span class="scratch-tab-tree-chevron">{icon(CHEVRON)}</span>
          <span class="scratch-tab-tree-folder">{icon(FOLDER)}</span>
          <span class="scratch-tab-tree-name">{entry.name}</span>
        </Button>
        {expanded && <Folder {...props} path={entry.path} depth={depth + 1} />}
      </>
    );
  }
  const content = (
    <>
      <span class="scratch-tab-tree-chevron" />
      <FileIcon name={entry.name} />
      <span class="scratch-tab-tree-name">{entry.name}</span>
    </>
  );
  // Media and archives cannot be edited, so offer Remote's download instead.
  if (MEDIA_OR_ARCHIVE.test(entry.name))
    return (
      <a
        class="scratch-tab-tree-row scratch-tab-tree-download"
        style={indent}
        href={props.downloadUrl(entry)}
        download={entry.name}
        title={`Download ${entry.name}`}
      >
        {content}
      </a>
    );
  const active = `/workspace/${entry.path}` === activePath;
  return (
    <Button
      class="scratch-tab-tree-row"
      style={indent}
      title={entry.path}
      aria-current={active ? 'page' : undefined}
      onClick={() => props.onOpenFile(entry)}
    >
      {content}
    </Button>
  );
}
