export interface DirectoryEntry {
  name: string;
  /** Path relative to /workspace, as Remote's file manager reports it. */
  path: string;
  isDir: boolean;
}
