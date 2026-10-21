import type { Release } from '../model/updates/api/releases.js';
import type { UpdateSnapshot } from '../model/updates/application/state.js';

import type { UpdateProgress, InstallationProgress } from '../port/updates/outbound/progress.js';

export class UpdateState implements UpdateProgress {
  #value: UpdateSnapshot = { status: '', busy: false, installed: false, available: false };
  #release: Release | undefined;
  #listeners = new Set<() => void>();

  get snapshot(): Readonly<UpdateSnapshot> {
    return { ...this.#value };
  }
  get release(): Release | undefined {
    return this.#release;
  }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
  startOperation(status: string): void {
    this.#value.busy = true;
    this.showMessage(status);
  }
  finishOperation(): void {
    this.#value.busy = false;
    this.#notify();
  }
  releaseChecked(release: Release, available: boolean, status: string): void {
    this.#release = release;
    this.#value.available = available;
    this.showMessage(status);
  }
  checkFailed(status: string): void {
    this.#value.available = false;
    this.showMessage(status);
  }
  markInstalled(): void {
    this.#value.installed = true;
  }
  showMessage(status: string): void {
    this.#value.status = status;
    this.#notify();
  }
}

// All updater popups share this state, including across activation lifetimes.
export class InstallationState implements InstallationProgress {
  #busy = false;
  get busy(): boolean {
    return this.#busy;
  }
  begin(): void {
    this.#busy = true;
  }
  finish(): void {
    this.#busy = false;
  }
}
