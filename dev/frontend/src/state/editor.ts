import type { EditorSnapshot, EditorChange } from '../model/editor/application/document.js';
import type { EditorProgress } from '../port/editor/outbound/progress.js';

export class EditorState implements EditorProgress {
  #feedback = {
    editable: false,
    unsupported: false,
    revision: 0,
    status: 'Loading…',
    failed: false,
  };
  #listeners = new Set<(change: EditorChange) => void>();
  constructor(private readonly documentState: () => Pick<EditorSnapshot, 'canSave' | 'dirty'>) {}
  get snapshot(): Readonly<EditorSnapshot> {
    return { ...this.#feedback, ...this.documentState() };
  }
  subscribe(listener: (change: EditorChange) => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #notify(change: EditorChange) {
    for (const listener of this.#listeners) listener(change);
  }
  loaded() {
    this.#feedback.revision++;
    this.#feedback.editable = true;
    this.#notify('text');
  }
  unsupported() {
    this.#feedback.unsupported = true;
    this.#notify('unsupported');
  }
  refresh() {
    this.#notify('state');
  }
  showMessage(status: string) {
    this.#feedback.status = status;
    this.#notify('status');
  }
  setError(failed: boolean) {
    this.#feedback.failed = failed;
    this.#notify('error');
  }
}
