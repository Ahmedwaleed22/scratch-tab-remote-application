import type { Release } from '../../../model/updates/api/releases.js';
import type { UpdateSnapshot } from '../../../model/updates/application/state.js';

export interface UpdateProgress {
  readonly snapshot: Readonly<UpdateSnapshot>;
  readonly release: Release | undefined;
  startOperation(status: string): void;
  finishOperation(): void;
  releaseChecked(release: Release, available: boolean, status: string): void;
  checkFailed(status: string): void;
  markInstalled(): void;
  showMessage(status: string): void;
}
export interface InstallationProgress {
  readonly busy: boolean;
  begin(): void;
  finish(): void;
}
