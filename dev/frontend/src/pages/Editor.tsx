import type { JSX } from 'preact';
import EditorWindow from '../components/EditorWindow.js';
import { useEditorWindow } from '../hooks/useEditorWindow.js';
import type { EditorWindowBinding } from '../hooks/useEditorWindow.js';

export default function Editor({ binding }: { binding: EditorWindowBinding }): JSX.Element {
  const editor = useEditorWindow(binding);
  return <EditorWindow {...editor} />;
}
