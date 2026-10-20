import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import { renderMermaid } from '../services/mermaid.js';

export function useMermaidPreview(preview: RefObject<HTMLElement>, html: string, visible: boolean) {
  useLayoutEffect(() => {
    const root = preview.current;
    if (!visible || !root) return;
    const blocks = [...root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')].map(
      code => {
        const source = code.textContent ?? '';
        const pre = code.parentElement!;
        const diagram = document.createElement('div');
        diagram.className = 'scratch-tab-mermaid';
        pre.before(diagram);
        return { source, pre, diagram };
      },
    );
    if (!blocks.length) return;
    let generation = 0;
    const render = () => {
      const current = ++generation;
      const dark = document.documentElement.matches('[data-theme="dark"], .dark');
      for (const { source, pre, diagram } of blocks) {
        void renderMermaid(source, dark).then(
          svg => {
            if (current !== generation) return;
            diagram.innerHTML = svg;
            diagram.setAttribute('role', 'img');
            diagram.setAttribute('aria-label', 'Mermaid diagram');
            pre.hidden = true;
          },
          () => {
            if (current !== generation) return;
            diagram.replaceChildren();
            diagram.removeAttribute('role');
            diagram.removeAttribute('aria-label');
            const message = document.createElement('p');
            message.textContent = 'Unable to render Mermaid diagram.';
            message.setAttribute('role', 'status');
            diagram.append(message);
            pre.hidden = false;
          },
        );
      }
    };
    render();
    const observer = new MutationObserver(render);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => {
      generation++;
      observer.disconnect();
      for (const { pre, diagram } of blocks) {
        pre.hidden = false;
        diagram.remove();
      }
    };
  }, [preview, html, visible]);
}
