import type { EditorSnapshot, EditorChange } from '../../../model/editor/application/document.js';

export interface EditorSession {
  readonly snapshot: Readonly<EditorSnapshot>;
  readonly text: string;
  readonly supportsFile: boolean;
  subscribe(listener: (change: EditorChange) => void): () => void;
  start(): void;
  edit(text: string): void;
  save(): Promise<void>;
  close(force?: boolean, confirmed?: boolean): boolean;
}
