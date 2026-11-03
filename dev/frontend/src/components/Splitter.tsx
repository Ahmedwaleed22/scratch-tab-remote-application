import type { JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

/**
 * A draggable, keyboard-operable separator. `vertical` sits between side-by-side panels and
 * resizes widths; `horizontal` sits between stacked panels and resizes heights.
 */
export default function Splitter({
  orientation,
  label,
  controls,
  size,
  bounds,
  invert = false,
  onResize,
  class: className,
}: {
  orientation: 'vertical' | 'horizontal';
  label: string;
  controls?: string;
  /** Current rendered size of the controlled panel; receives the handle to measure its neighbours. */
  size(handle: HTMLElement): number;
  bounds(handle: HTMLElement): [number, number];
  /** Dragging toward the start (left/up) grows the panel. */
  invert?: boolean;
  /** `null` restores the default size. */
  onResize(size: number | null): void;
  class?: string;
}): JSX.Element {
  const drag = useRef<{ origin: number; start: number } | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  const axis = (event: PointerEvent): number =>
    orientation === 'vertical' ? event.clientX : event.clientY;
  const resize = (next: number): void => {
    const [min, max] = bounds(handle.current!);
    onResize(Math.round(Math.min(Math.max(next, min), Math.max(min, max))));
  };
  // Panel sizes come from layout, so the range is published after each render.
  useLayoutEffect(() => {
    const node = handle.current!;
    const [min, max] = bounds(node);
    node.setAttribute('aria-valuemin', String(Math.round(min)));
    node.setAttribute('aria-valuemax', String(Math.round(Math.max(min, max))));
    node.setAttribute('aria-valuenow', String(Math.round(size(node))));
  });
  return (
    <div
      ref={handle}
      class={`scratch-tab-splitter ${className ?? ''}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={orientation}
      data-orientation={orientation}
      title="Drag to resize · Double-click to reset"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        drag.current = { origin: axis(event), start: size(event.currentTarget) };
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        const delta = axis(event) - drag.current.origin;
        resize(drag.current.start + (invert ? -delta : delta));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDblClick={() => onResize(null)}
      onKeyDown={event => {
        const step = event.shiftKey ? 50 : 10;
        const grow = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
        const shrink = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
        const direction = event.key === grow ? 1 : event.key === shrink ? -1 : 0;
        const node = event.currentTarget;
        if (direction) resize(size(node) + (invert ? -direction : direction) * step);
        else if (event.key === 'Home') resize(bounds(node)[0]);
        else if (event.key === 'End') resize(bounds(node)[1]);
        else if (event.key === 'Enter') onResize(null);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}
