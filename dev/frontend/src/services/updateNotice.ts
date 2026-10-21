import { isNewer } from './releaseVersion.js';
import { UPDATE_NOTICE_INTERVAL_MS } from '../config/constants/updates.js';
import type { ReleaseSource } from '../port/updates/outbound/releases.js';
import type { UpdateChecks } from '../model/updates/application/state.js';
import type { UpdateNotice } from '../port/updates/inbound/session.js';

interface Dependencies {
  api: Pick<ReleaseSource, 'packages' | 'latest'>;
  projectId: string;
  checks: UpdateChecks;
  currentVersion(): string;
  now(): number;
  isCancelled(): boolean;
  onAvailable(version: string | null): void;
}
export function createUpdateNotice({
  api,
  projectId,
  checks,
  currentVersion,
  now,
  isCancelled,
  onAvailable,
}: Dependencies): UpdateNotice {
  let busy = false;
  function show(version: string): void {
    onAvailable(isNewer(version, currentVersion()) ? version : null);
  }
  async function check(): Promise<void> {
    if (busy || isCancelled()) return;
    const cached = checks.get(projectId);
    if (cached && now() - cached.checkedAt < UPDATE_NOTICE_INTERVAL_MS) {
      show(cached.version);
      return;
    }
    busy = true;
    try {
      await api.packages();
      const latest = await api.latest();
      if (isCancelled()) return;
      checks.set(projectId, { version: latest.version, checkedAt: now() });
      show(latest.version);
    } catch {
      // Background failures stay quiet; the app-card updater exposes retry errors.
      if (!isCancelled()) {
        checks.delete(projectId);
        onAvailable(null);
      }
    } finally {
      busy = false;
    }
  }
  return { check };
}
