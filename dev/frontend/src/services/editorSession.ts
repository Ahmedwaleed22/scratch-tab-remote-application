import { MISSING_FILE_MESSAGE, UNSUPPORTED_DOCUMENT } from '../config/editor.js';
import type { EditorDocument } from './editorDocument.js';
import type { EditorProgress } from '../port/editor/outbound/progress.js';
import type { EditorSession } from '../port/editor/inbound/session.js';

interface Dependencies {
  documentModel: EditorDocument;
  name: string;
  state: EditorProgress;
  isCancelled(): boolean;
  confirm(message: string): boolean;
  /** Called when the file disappears or is recreated, so file listings can refresh. */
  onFilesChanged?(): void;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && error.message === MISSING_FILE_MESSAGE;

export function createEditorSession({
  documentModel,
  name,
  state,
  isCancelled,
  confirm,
  onFilesChanged,
}: Dependencies): EditorSession {
  const session: EditorSession = {
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
          if (isMissing(error)) {
            onFilesChanged?.();
            if (documentModel.loadMissing()) {
              state.loaded();
              state.refresh();
              state.showMessage('File was deleted · Recreate it to keep your unsaved draft');
              state.setError(true);
            } else state.notFound(true);
          } else if (
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
    retry() {
      state.notFound(false);
      state.showMessage('Loading…');
      state.setError(false);
      session.start();
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
      state.showMessage(command.create ? 'Recreating…' : 'Saving…');
      try {
        await documentModel.commitSave(command);
        if (command.create) onFilesChanged?.();
        state.showMessage(
          documentModel.dirty
            ? 'Saved earlier changes · Unsaved edits remain'
            : command.create
              ? 'Recreated · UTF-8'
              : 'Saved · UTF-8',
        );
        state.setError(false);
      } catch (error) {
        if (isMissing(error)) {
          documentModel.markMissing();
          onFilesChanged?.();
          state.showMessage('File was deleted on disk · Recreate it to keep your edits');
        } else state.showMessage(error instanceof Error ? error.message : String(error));
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
  return session;
}
