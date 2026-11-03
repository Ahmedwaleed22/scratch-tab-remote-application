import type { JSX, RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

export default function LineNumbers({
  text,
  textarea,
}: {
  text: string;
  textarea: RefObject<HTMLTextAreaElement>;
}): JSX.Element {
  const mirror = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const input = textarea.current!;
    const layer = mirror.current!;
    const synchronize = () => {
      layer.style.width = `${input.clientWidth}px`;
      layer.style.transform = `translateY(${-input.scrollTop}px)`;
    };
    const observer = new ResizeObserver(synchronize);
    observer.observe(input);
    input.addEventListener('scroll', synchronize);
    synchronize();
    return () => {
      observer.disconnect();
      input.removeEventListener('scroll', synchronize);
    };
  }, []);
  const lines = text.split('\n');
  return (
    <div
      class="scratch-tab-line-numbers"
      aria-hidden="true"
      style={{ '--scratch-line-digits': String(Math.max(2, String(lines.length).length)) }}
    >
      {/* Mirroring each line's wrapping keeps numbers aligned without measuring text. */}
      <div class="scratch-tab-line-mirror" ref={mirror}>
        {lines.map((line, index) => (
          <div key={index} data-line={index + 1}>
            {line || '\u200b'}
          </div>
        ))}
      </div>
    </div>
  );
}
