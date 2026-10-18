import { mountChat } from './app/chat.js';
import { createFiles } from './api/files.js';

const drafts = new Map();

export default function activate(remote) {
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
