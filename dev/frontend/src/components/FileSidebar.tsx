import type { DirectoryEntry } from '../model/files/application/directory.js';
import type { JSX, RefObject } from 'preact';
import Button from './Button.js';
import FileIcon from './FileIcon.js';
import type { FileTreeSnapshot } from '../model/files/application/tree.js';
import { MEDIA_OR_ARCHIVE } from '../config/editor.js';
import { FILE_TREE_ICONS } from '../config/constants/files.js';

export interface FileSidebarProps {
  snapshot: Readonly<FileTreeSnapshot>;
  /** The /workspace path of the file shown in this window. */
  activePath: string;
  visible: boolean;
  treeRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
  refreshStatus: string;
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

export default function FileSidebar(props: FileSidebarProps): JSX.Element {
  const { snapshot, visible, onRefresh, treeRef, busy, refreshStatus } = props;
  return (
    <nav class="scratch-tab-sidebar" aria-label="Workspace files" hidden={!visible}>
      <div class="scratch-tab-sidebar-header">
        <span>Files</span>
        <Button
          aria-label="Refresh files"
          title={busy ? 'Refreshing files…' : 'Refresh files'}
          aria-busy={busy}
          disabled={busy}
          onClick={onRefresh}
        >
          {icon(FILE_TREE_ICONS.refresh)}
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
          <span class="scratch-tab-tree-chevron">{icon(FILE_TREE_ICONS.chevron)}</span>
          <span class="scratch-tab-tree-folder">{icon(FILE_TREE_ICONS.folder)}</span>
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
