import { mountChat } from './app/chat.js';

const drafts = new Map();

export default function activate(remote) {
  remote.ui.register(remote.slots.chatHeaderActions, (_host, context) => {
    if (!context.chatId) return;
    return mountChat({
      context,
      drafts,
      callFile: body => remote.backend.call('file', { projectId: context.projectId, method: 'POST', body }),
      launchIde: target => target.openIde ? target.openIde() : window.open(target.ide, '_blank', 'noopener,noreferrer'),
    });
  });
}
