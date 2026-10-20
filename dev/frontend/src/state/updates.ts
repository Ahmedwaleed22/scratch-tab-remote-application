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
  get release() {
    return this.#release;
  }
  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #notify() {
    for (const listener of this.#listeners) listener();
  }
  startOperation(status: string) {
    this.#value.busy = true;
    this.showMessage(status);
  }
  finishOperation() {
    this.#value.busy = false;
    this.#notify();
  }
  releaseChecked(release: Release, available: boolean, status: string) {
    this.#release = release;
    this.#value.available = available;
    this.showMessage(status);
  }
  checkFailed(status: string) {
    this.#value.available = false;
    this.showMessage(status);
  }
  markInstalled() {
    this.#value.installed = true;
  }
  showMessage(status: string) {
    this.#value.status = status;
    this.#notify();
  }
}

// All updater popups share this state, including across activation lifetimes.
export class InstallationState implements InstallationProgress {
  #busy = false;
  get busy() {
    return this.#busy;
  }
  begin() {
    this.#busy = true;
  }
  finish() {
    this.#busy = false;
  }
}
