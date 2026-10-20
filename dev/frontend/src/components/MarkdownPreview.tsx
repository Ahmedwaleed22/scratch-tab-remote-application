import type { RefObject } from 'preact';
import { useMermaidPreview } from '../hooks/useMermaidPreview.js';

interface Props {
  name: string;
  html: string;
  visible: boolean;
  previewRef: RefObject<HTMLElement>;
}
export default function MarkdownPreview({ name, html, visible, previewRef }: Props) {
  useMermaidPreview(previewRef, html, visible);
  return (
    <article
      class="scratch-tab-markdown"
      aria-label={`${name} Markdown preview`}
      tabIndex={0}
      hidden={!visible}
      ref={previewRef}
      dangerouslySetInnerHTML={{ __html: visible ? html : '' }}
    />
  );
}
