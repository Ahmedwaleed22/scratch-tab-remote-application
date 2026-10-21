import type { DirectoryEntry } from '../../types.js';

/** Folder keys are paths relative to /workspace; '' is the workspace root. */
export interface FileTreeSnapshot {
  /** Desktop sidebar visibility, remembered in this browser. */
  open: boolean;
  /** Phone drawer visibility, which starts closed for every page. */
  drawerOpen: boolean;
  children: ReadonlyMap<string, readonly DirectoryEntry[]>;
  expanded: ReadonlySet<string>;
  loading: ReadonlySet<string>;
  errors: ReadonlyMap<string, string>;
}
