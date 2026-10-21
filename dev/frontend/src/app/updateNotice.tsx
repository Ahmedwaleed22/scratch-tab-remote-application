import { createUpdates } from '../api/updates.js';
import { createUpdateNotice } from '../services/updateNotice.js';
import { render } from 'preact';
import UpdateNotice from '../components/UpdateNotice.js';
import { mountUpdates } from './updates.js';
import type { Remote, Drafts, Popup } from '../types.js';
import type { UpdateChecks } from '../model/updates/application/state.js';

// Remote owns icon sizing; the chat contribution owns this notice's lifetime.
export function mountUpdateNotice({
  remote,
  projectId,
  drafts,
  checks,
}: {
  remote: Remote;
  projectId: string;
  drafts: Drafts;
  checks: UpdateChecks;
}): () => void {
  const lifetime = new AbortController();
  let disposeButton: (() => void) | undefined;
  let popup: Popup | undefined;
  const notice = createUpdateNotice({
    api: createUpdates(remote.backend, projectId, lifetime.signal),
    projectId,
    checks,
    currentVersion: () => remote.application.version,
    now: () => Date.now(),
    isCancelled: () => lifetime.signal.aborted,
    onAvailable(version) {
      disposeButton?.();
      disposeButton = undefined;
      if (version === null) return;
      disposeButton = remote.ui.addIconButton(remote.slots.chatHeaderActions, {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/><circle cx="20" cy="4" r="3" fill="currentColor" stroke="none"/></svg>',
        label: `Scratch Tab update available: v${version}`,
        title: `Scratch Tab v${version} is available. Click to update.`,
        when: context => context.projectId === projectId && Boolean(context.chatId),
        onClick: () => {
          popup?.close();
          popup = remote.ui.openPopup({
            title: 'Scratch Tab updates',
            width: 420,
            mount: body => mountUpdates(body, { remote, projectId, drafts }),
          });
        },
      });
    },
  });
  const root = document.createElement('div');
  render(<UpdateNotice notice={notice} />, root);
  return () => {
    lifetime.abort();
    render(null, root);
    disposeButton?.();
    popup?.close();
  };
}
