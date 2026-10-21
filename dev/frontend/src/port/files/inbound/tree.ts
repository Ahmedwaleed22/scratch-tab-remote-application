import type { FileTreeSnapshot } from '../../../model/files/tree.js';

export interface FileTree {
  readonly snapshot: Readonly<FileTreeSnapshot>;
  subscribe(listener: () => void): () => void;
  setOpen(open: boolean, compact: boolean): void;
  toggleFolder(path: string): void;
  /** Expands the folders containing a /workspace file path. */
  reveal(path: string): void;
  refresh(): void;
  downloadUrl(relative: string): string;
  setChat(chatId: string): void;
  dispose(): void;
}
