import { createRef, render } from 'preact';
import Editor from '../pages/Editor.js';
import { createEditorSession } from '../services/editorSession.js';
import { EditorState } from '../state/editor.js';
import type { EditorDocument } from '../services/editorDocument.js';
import type { EditorWindowBinding } from '../hooks/useEditorWindow.js';
import type { EditorWindowView } from '../port/editor/outbound/view.js';

type WindowOptions = Omit<
  EditorWindowBinding,
  'session' | 'signal' | 'previous' | 'dispose' | 'controllerRef'
> & {
  documentModel: EditorDocument;
};

export function mountEditorWindow(options: WindowOptions): EditorWindowView {
  const previous = document.activeElement;
  const lifetime = new AbortController();
  const root = document.createElement('div');
  const controllerRef = createRef<EditorWindowView>();
  const { documentModel } = options;
  const state = new EditorState(() => ({
    canSave: documentModel.canSave,
    dirty: documentModel.dirty,
  }));
  const session = createEditorSession({
    documentModel,
    name: options.target.name,
    state,
    isCancelled: () => lifetime.signal.aborted,
    confirm: message => confirm(message),
  });
  document.body.append(root);
  render(
    <Editor
      binding={{
        ...options,
        session,
        signal: lifetime.signal,
        previous,
        controllerRef,
        dispose() {
          lifetime.abort();
          render(null, root);
          root.remove();
        },
      }}
    />,
    root,
  );
  return controllerRef.current!;
}
