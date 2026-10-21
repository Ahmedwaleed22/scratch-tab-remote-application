import type { EditorSnapshot, EditorChange } from '../model/editor/application/document.js';
import type { EditorProgress } from '../port/editor/outbound/progress.js';

export class EditorState implements EditorProgress {
  #feedback: Omit<EditorSnapshot, 'canSave' | 'dirty' | 'missing'> = {
    editable: false,
    unsupported: false,
    notFound: false,
    revision: 0,
    status: 'Loading…',
    failed: false,
  };
  #listeners = new Set<(change: EditorChange) => void>();
  constructor(
    private readonly documentState: () => Pick<EditorSnapshot, 'canSave' | 'dirty' | 'missing'>,
  ) {}
  get snapshot(): Readonly<EditorSnapshot> {
    return { ...this.#feedback, ...this.documentState() };
  }
  subscribe(listener: (change: EditorChange) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #notify(change: EditorChange): void {
    for (const listener of this.#listeners) listener(change);
  }
  loaded(): void {
    this.#feedback.revision++;
    this.#feedback.editable = true;
    this.#notify('text');
  }
  unsupported(): void {
    this.#feedback.unsupported = true;
    this.#notify('unsupported');
  }
  notFound(found: boolean): void {
    this.#feedback.notFound = found;
    this.#notify('not-found');
  }
  refresh(): void {
    this.#notify('state');
  }
  showMessage(status: string): void {
    this.#feedback.status = status;
    this.#notify('status');
  }
  setError(failed: boolean): void {
    this.#feedback.failed = failed;
    this.#notify('error');
  }
}
