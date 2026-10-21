import type { RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { highlightSyntax } from '../presenters/syntax.js';
import type { SyntaxLanguage } from '../model/editor/application/syntax.js';

export function useSyntaxHighlight(
  textarea: RefObject<HTMLTextAreaElement>,
  paint: RefObject<HTMLPreElement | null>,
  language: SyntaxLanguage,
  revision: number,
): void {
  const refresh = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const input = textarea.current!;
    const layer = paint.current!;
    let frame = 0;
    const synchronize = () => {
      layer.style.width = `${input.clientWidth}px`;
      layer.style.height = `${input.clientHeight}px`;
      layer.scrollTop = input.scrollTop;
      layer.scrollLeft = input.scrollLeft;
    };
    refresh.current = () => {
      const highlighted = highlightSyntax(input.value, language);
      if (highlighted === null) layer.textContent = input.value + '\n';
      else layer.innerHTML = highlighted + '\n';
      synchronize();
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        refresh.current();
      });
    };
    const observer = new ResizeObserver(synchronize);
    observer.observe(input);
    input.addEventListener('input', schedule);
    input.addEventListener('scroll', synchronize);
    refresh.current();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      input.removeEventListener('input', schedule);
      input.removeEventListener('scroll', synchronize);
    };
  }, [language]);
  useLayoutEffect(() => refresh.current(), [revision]);
}
