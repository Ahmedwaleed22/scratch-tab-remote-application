import { mountChat } from './app/chat.js';
import type { ChatSession } from './app/chat.js';
import { mountUpdates } from './app/updates.js';
import { mountUpdateNotice } from './app/updateNotice.js';
import type { UpdateChecks } from './model/updates/application/state.js';
import { createFiles } from './api/files.js';
import { render } from 'preact';
import Button from './components/Button.js';
import type { Remote, Drafts, Popup } from './types.js';

const drafts: Drafts = new Map();

export default function activate(remote: Remote): void {
  const updateChecks: UpdateChecks = new Map();
  let updateNotice:
    { projectId: string; chatId: string; owners: number; dispose(): void } | undefined;
  remote.ui.register(
    remote.slots.applicationCardActions,
    (host, context) => {
      const projectId = context.projectId;
      if (!projectId || context.instance?.applicationId !== remote.application.id) return;
      let popup: Popup | undefined;
      host.classList.add('scratch-tab-card-actions');
      render(
        <Button
          onClick={() => {
            popup?.close();
            popup = remote.ui.openPopup({
              title: 'Scratch Tab updates',
              width: 420,
              mount: body => mountUpdates(body, { remote, projectId, drafts }),
            });
          }}
        >
          Updates
        </Button>,
        host,
      );
      return () => {
        popup?.close();
        render(null, host);
        host.classList.remove('scratch-tab-card-actions');
      };
    },
    { when: context => context.instance?.applicationId === remote.application.id },
  );
  let session: ChatSession | null;
  let chatOwners = 0;
  let projectId: string | undefined;
  // The sidebar survives keyed chat remounts; its scope owns final cleanup.
  remote.ui.register(remote.slots.sidebarHeaderActions, () => () => {
    session?.();
    session = null;
    updateNotice?.dispose();
    updateNotice = undefined;
  });
  remote.ui.register(remote.slots.chatHeaderActions, (_host, context) => {
    if (!context.chatId || !context.projectId || projectId !== context.projectId) {
      session?.();
      session = null;
    }
    if (!context.chatId || !context.projectId) return;
    projectId = context.projectId;
    if (session)
      session.setContext({ ...context, projectId: context.projectId, chatId: context.chatId });
    else
      session = mountChat({
        context: { ...context, projectId: context.projectId, chatId: context.chatId },
        drafts,
        files: createFiles(remote.backend, context.projectId),
        launchIde: target =>
          target.openIde
            ? target.openIde()
            : window.open(target.ide, '_blank', 'noopener,noreferrer'),
      });
    const ownerSession = session;
    chatOwners++;
    // Desktop and mobile slots stay mounted together; the icon registration is global.
    if (
      !updateNotice ||
      updateNotice.projectId !== context.projectId ||
      updateNotice.chatId !== context.chatId
    ) {
      updateNotice?.dispose();
      updateNotice = {
        projectId: context.projectId,
        chatId: context.chatId,
        owners: 0,
        dispose: mountUpdateNotice({
          remote,
          projectId: context.projectId,
          drafts,
          checks: updateChecks,
        }),
      };
    }
    const notice = updateNotice;
    notice.owners++;
    return () => {
      notice.owners--;
      if (notice.owners === 0 && updateNotice === notice) {
        notice.dispose();
        updateNotice = undefined;
      }
      chatOwners--;
      if (chatOwners === 0 && session === ownerSession) ownerSession.suspend();
    };
  });
}
