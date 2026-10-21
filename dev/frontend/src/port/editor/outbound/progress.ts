import type { EditorSnapshot, EditorChange } from '../../../model/editor/application/document.js';

export interface EditorProgress {
  readonly snapshot: Readonly<EditorSnapshot>;
  subscribe(listener: (change: EditorChange) => void): () => void;
  loaded(): void;
  unsupported(): void;
  refresh(): void;
  showMessage(message: string): void;
  setError(failed: boolean): void;
}
