import type { DirectoryEntry } from '../types.js';
import type { FileTreeSnapshot } from '../model/files/tree.js';

// Owns folder listings and sidebar visibility; workflows live in services/fileTree.ts.
export class FileTreeState {
  #snapshot: FileTreeSnapshot;
  #listeners = new Set<() => void>();
  constructor(open: boolean) {
    this.#snapshot = {
      open,
      drawerOpen: false,
      children: new Map(),
      expanded: new Set(),
      loading: new Set(),
      errors: new Map(),
    };
  }
  get snapshot(): Readonly<FileTreeSnapshot> {
    return this.#snapshot;
  }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #update(change: Partial<FileTreeSnapshot>): void {
    // Each change publishes a new snapshot so subscribers can compare by identity.
    this.#snapshot = { ...this.#snapshot, ...change };
    for (const listener of this.#listeners) listener();
  }
  setOpen(open: boolean, compact: boolean): void {
    this.#update(compact ? { drawerOpen: open } : { open });
  }
  expand(paths: readonly string[]): void {
    this.#update({ expanded: new Set([...this.#snapshot.expanded, ...paths]) });
  }
  collapse(path: string): void {
    const expanded = new Set(this.#snapshot.expanded);
    expanded.delete(path);
    this.#update({ expanded });
  }
  loading(path: string): void {
    this.#update({ loading: new Set(this.#snapshot.loading).add(path) });
  }
  loaded(path: string, entries: readonly DirectoryEntry[]): void {
    const loading = new Set(this.#snapshot.loading);
    loading.delete(path);
    const errors = new Map(this.#snapshot.errors);
    errors.delete(path);
    this.#update({
      loading,
      errors,
      children: new Map(this.#snapshot.children).set(path, entries),
    });
  }
  failed(path: string, message: string): void {
    const loading = new Set(this.#snapshot.loading);
    loading.delete(path);
    const children = new Map(this.#snapshot.children);
    children.delete(path);
    this.#update({ loading, children, errors: new Map(this.#snapshot.errors).set(path, message) });
  }
}
