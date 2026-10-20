import EditorWindow from '../components/EditorWindow.js';
import { useEditorWindow } from '../hooks/useEditorWindow.js';
import type { EditorWindowBinding } from '../hooks/useEditorWindow.js';

export default function Editor({ binding }: { binding: EditorWindowBinding }) {
  const editor = useEditorWindow(binding);
  return <EditorWindow {...editor} />;
}
