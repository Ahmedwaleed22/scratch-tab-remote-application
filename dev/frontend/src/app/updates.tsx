import { createUpdates } from '../api/updates.js';
import { createUpdateSession } from '../services/updates.js';
import { InstallationState, UpdateState } from '../state/updates.js';
import { render } from 'preact';
import Updates from '../pages/Updates.js';
import type { Remote, Drafts } from '../types.js';

interface UpdateOptions {
  remote: Remote;
  projectId: string;
  drafts: Drafts;
  reload?(): void;
}
const installation = new InstallationState();

export function mountUpdates(
  host: HTMLElement,
  { remote, projectId, drafts, reload = () => location.reload() }: UpdateOptions,
): () => void {
  const lifetime = new AbortController();
  const state = new UpdateState();
  const session = createUpdateSession({
    api: createUpdates(remote.backend, projectId, lifetime.signal),
    state,
    installation,
    currentVersion: () => remote.application.version,
    drafts,
    confirm: message => confirm(message),
    reload,
    isCancelled: () => lifetime.signal.aborted,
  });
  render(<Updates binding={{ state, session, signal: lifetime.signal }} />, host);
  return () => {
    lifetime.abort();
    render(null, host);
  };
}
