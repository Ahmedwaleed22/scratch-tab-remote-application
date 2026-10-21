import { UNSUPPORTED_DOCUMENT } from '../config/editor.js';
import type { EditorDocument } from './editorDocument.js';
import type { EditorProgress } from '../port/editor/outbound/progress.js';
import type { EditorSession } from '../port/editor/inbound/session.js';

interface Dependencies {
  documentModel: EditorDocument;
  name: string;
  state: EditorProgress;
  isCancelled(): boolean;
  confirm(message: string): boolean;
}

export function createEditorSession({
  documentModel,
  name,
  state,
  isCancelled,
  confirm,
}: Dependencies): EditorSession {
  return {
    get snapshot() {
      return state.snapshot;
    },
    get text() {
      return documentModel.text;
    },
    get supportsFile() {
      return !UNSUPPORTED_DOCUMENT.test(name);
    },
    subscribe: listener => state.subscribe(listener),
    start() {
      if (UNSUPPORTED_DOCUMENT.test(name)) {
        state.unsupported();
        return;
      }
      documentModel
        .read()
        .then(result => {
          if (isCancelled()) return;
          // Match the native textarea's newline normalization without putting DOM in the service.
          const restored = documentModel.load(result, result.content.replace(/\r\n?/g, '\n'));
          state.loaded();
          state.refresh();
          state.showMessage(
            restored
              ? 'Restored unsaved draft · Save to write to disk'
              : 'UTF-8 · Ctrl/Cmd+S to save',
          );
        })
        .catch(error => {
          if (isCancelled()) return;
          if (
            error instanceof Error &&
            error.message === 'Only UTF-8 text files up to 128 KiB are supported.'
          )
            state.unsupported();
          else {
            state.showMessage(error instanceof Error ? error.message : String(error));
            state.setError(true);
          }
        });
    },
    edit(text) {
      documentModel.edit(text);
      state.refresh();
      documentModel.remember();
      state.showMessage(documentModel.dirty ? 'Unsaved changes' : 'No changes');
    },
    async save() {
      const command = documentModel.beginSave();
      if (command.kind === 'idle') return;
      if (command.kind === 'too-large') {
        state.showMessage('File exceeds the 128 KiB save limit.');
        return;
      }
      state.refresh();
      state.showMessage('Saving…');
      try {
        await documentModel.commitSave(command);
        state.showMessage(
          documentModel.dirty ? 'Saved earlier changes · Unsaved edits remain' : 'Saved · UTF-8',
        );
        state.setError(false);
      } catch (error) {
        state.showMessage(error instanceof Error ? error.message : String(error));
        state.setError(true);
      } finally {
        documentModel.finishSave();
        state.refresh();
      }
    },
    close(force = false, confirmed = false) {
      if (
        !force &&
        !confirmed &&
        documentModel.dirty &&
        !confirm('Discard unsaved changes to this file?')
      )
        return false;
      if (force) documentModel.remember();
      else documentModel.discardDraft();
      return true;
    },
  };
}
