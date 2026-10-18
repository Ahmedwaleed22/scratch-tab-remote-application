import { mountChat } from './app/chat.js';
import { mountUpdates } from './views/updates.js';
import { createFiles } from './api/files.js';
import { createButton } from './views/button.js';

const drafts = new Map();

export default function activate(remote) {
  remote.ui.register(remote.slots.applicationCardActions, (host, context) => {
    if (!context.projectId || context.instance?.applicationId !== remote.application.id) return;
    const lifetime = new AbortController();
    let popup;
    host.classList.add('scratch-tab-card-actions');
    createButton('Updates', () => {
      popup?.close();
      popup = remote.ui.openPopup({
        title: 'Scratch Tab updates',
        width: 420,
        mount: body => mountUpdates(body, { remote, projectId: context.projectId, drafts }),
      });
    }, host, lifetime.signal);
    return () => { lifetime.abort(); popup?.close(); host.replaceChildren(); host.classList.remove('scratch-tab-card-actions'); };
  }, { when: context => context.instance?.applicationId === remote.application.id });
  remote.ui.register(remote.slots.chatHeaderActions, (_host, context) => {
    if (!context.chatId) return;
    return mountChat({
      context,
      drafts,
      files: createFiles(remote.backend, context.projectId),
      launchIde: target => target.openIde ? target.openIde() : window.open(target.ide, '_blank', 'noopener,noreferrer'),
    });
  });
}
