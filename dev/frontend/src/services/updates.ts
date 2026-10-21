import { isNewer } from './releaseVersion.js';
import type { ReleaseSource } from '../port/updates/outbound/releases.js';
import type { UpdateProgress, InstallationProgress } from '../port/updates/outbound/progress.js';
import type { UpdateSession } from '../port/updates/inbound/session.js';

interface Dependencies {
  api: ReleaseSource;
  state: UpdateProgress;
  installation: InstallationProgress;
  currentVersion(): string;
  drafts: { readonly size: number };
  confirm(message: string): boolean;
  reload(): void;
  isCancelled(): boolean;
}

export function createUpdateSession({
  api,
  state,
  installation,
  currentVersion,
  drafts,
  confirm,
  reload,
  isCancelled,
}: Dependencies): UpdateSession {
  async function checkRelease(): Promise<void> {
    if (state.snapshot.busy || state.snapshot.installed) return;
    state.startOperation('Checking GitHub…');
    try {
      await api.packages(); // Release checks require Remote's administrator permission.
      const latest = await api.latest();
      const available = isNewer(latest.version, currentVersion());
      state.releaseChecked(
        latest,
        available,
        available
          ? `Version ${latest.version} is available (installed: ${currentVersion()}).`
          : `Scratch Tab ${currentVersion()} is up to date.`,
      );
    } catch (error) {
      state.checkFailed(error instanceof Error ? error.message : String(error));
    } finally {
      state.finishOperation();
    }
  }
  function refresh(): void {
    if (drafts.size) {
      state.showMessage('Save or discard all Scratch Tab drafts in this tab before refreshing.');
      return;
    }
    reload();
  }
  async function install(): Promise<void> {
    if (state.snapshot.installed) {
      refresh();
      return;
    }
    const latest = state.release;
    if (state.snapshot.busy || installation.busy || !latest) return;
    if (drafts.size) {
      state.showMessage('Save or discard all Scratch Tab drafts in this tab before updating.');
      return;
    }
    if (
      !confirm(
        `Update Scratch Tab to ${latest.version} in every project on this server? Save work in other tabs first. This page will refresh when ready.`,
      )
    )
      return;
    installation.begin();
    state.startOperation('Downloading and installing…');
    try {
      const packages = await api.packages();
      const current = packages.find(item => item.id === 'scratch-tab');
      if (!current?.version || !isNewer(latest.version, current.version))
        throw new Error('The server package changed. Refresh Remote before updating.');
      if (drafts.size) throw new Error('Save or discard Scratch Tab drafts before updating.');
      const result = await api.install(latest.version, () => {
        if (isCancelled()) throw new Error('Update cancelled before upload.');
        if (drafts.size)
          throw new Error(
            'A Scratch Tab draft was created during download. Save it before updating.',
          );
      });
      if (result.id !== 'scratch-tab' || result.version !== latest.version)
        throw new Error('Unexpected package response. Check Applications before refreshing.');
      state.markInstalled();
      const failed = (result.upgraded || []).filter(item => item.error);
      if (failed.length)
        state.showMessage(
          `Package updated, but ${failed.length} project upgrade(s) failed. Open Applications to inspect errors and retry by starting the affected copy.`,
        );
      else {
        state.showMessage('Update installed. Refresh to load it.');
        if (!isCancelled()) refresh();
      }
    } catch (error) {
      state.showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      installation.finish();
      state.finishOperation();
    }
  }
  return { checkRelease, install };
}
