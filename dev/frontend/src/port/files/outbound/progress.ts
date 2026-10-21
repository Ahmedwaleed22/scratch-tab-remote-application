import type { DirectoryEntry } from '../../../model/files/application/directory.js';
import type { FileTreeSnapshot } from '../../../model/files/application/tree.js';

export interface FileTreeProgress {
  readonly snapshot: Readonly<FileTreeSnapshot>;
  subscribe(listener: () => void): () => void;
  setOpen(open: boolean, compact: boolean): void;
  expand(paths: readonly string[]): void;
  collapse(path: string): void;
  loading(path: string): void;
  loaded(path: string, entries: readonly DirectoryEntry[]): void;
  failed(path: string, message: string): void;
}
