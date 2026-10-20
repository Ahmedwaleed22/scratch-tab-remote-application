import type { RefObject, ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { useSyntaxHighlight } from '../hooks/useSyntaxHighlight.js';

interface Props {
  language: string;
  textarea: RefObject<HTMLTextAreaElement>;
  revision: number;
  hidden: boolean;
  children: ComponentChildren;
}
// The native textarea retains ownership of text, selection and undo.
export default function SyntaxSurface({ language, textarea, revision, hidden, children }: Props) {
  const paint = useRef<HTMLPreElement>(null);
  useSyntaxHighlight(textarea, paint, language, revision);
  return (
    <div class="scratch-tab-codearea" data-language={language} hidden={hidden}>
      <pre aria-hidden="true" ref={paint} />
      {children}
    </div>
  );
}
