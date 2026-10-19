import { WINDOW_LAYOUT, WINDOW_MOVE_KEYS } from '../config/windowLayout.js';

export function restoreWindowLayout(panel, index, persistence) {
  const {
    initialLeft,
    initialTop,
    cascadeOffset,
    viewportMargin,
    initialHorizontalRoom,
    initialVerticalRoom,
  } = WINDOW_LAYOUT;

  const cascadeDistance = index * cascadeOffset;
  const maximumInitialLeft = Math.max(viewportMargin, innerWidth - initialHorizontalRoom);
  const maximumInitialTop = Math.max(viewportMargin, innerHeight - initialVerticalRoom);
  const left = Math.min(initialLeft + cascadeDistance, maximumInitialLeft);
  const top = Math.min(initialTop + cascadeDistance, maximumInitialTop);

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  const saved = persistence.read();
  if (saved) Object.assign(panel.style, saved);
}

export function bindWindowLayout({ panel, header, signal, persistence }) {
  const compact = matchMedia(WINDOW_LAYOUT.compactQuery);

  function position(x, y) {
    header.setAttribute(
      'aria-label',
      compact.matches
        ? 'File window title bar'
        : 'File window title bar. Use arrow keys to reposition.',
    );
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? innerWidth;
    const height = viewport?.height ?? innerHeight;
    panel.style.setProperty('--scratch-viewport-width', `${width}px`);
    panel.style.setProperty('--scratch-viewport-height', `${height}px`);
    // Desktop windows may leave the viewport, but retain a reachable title-bar strip.
    const { visibleTitleWidth, viewportMargin } = WINDOW_LAYOUT;
    const minimumLeft = left + visibleTitleWidth - panel.offsetWidth;
    const maximumLeft = left + width - visibleTitleWidth;
    const minimumTop = top + viewportMargin;
    const maximumTop = top + height - header.offsetHeight - viewportMargin;
    const nextLeft = compact.matches
      ? left + viewportMargin
      : Math.max(minimumLeft, Math.min(x, maximumLeft));
    const nextTop = compact.matches
      ? top + viewportMargin
      : Math.max(minimumTop, Math.min(y, maximumTop));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
  }

  const fitViewport = () => {
    if (panel.style.display !== 'none') position(panel.offsetLeft, panel.offsetTop);
  };
  fitViewport();

  function rememberGeometry() {
    if (compact.matches || panel.style.display === 'none' || !panel.isConnected) return;
    persistence.write({
      left: panel.offsetLeft,
      top: panel.offsetTop,
      width: panel.offsetWidth,
      height: panel.offsetHeight,
    });
  }

  let previousInlineSize = `${panel.style.width}:${panel.style.height}`;
  const resizeObserver = new ResizeObserver(() => {
    const currentInlineSize = `${panel.style.width}:${panel.style.height}`;
    if (currentInlineSize === previousInlineSize) return;
    previousInlineSize = currentInlineSize;
    rememberGeometry();
  });
  resizeObserver.observe(panel);
  signal.addEventListener('abort', () => resizeObserver.disconnect(), { once: true });

  let dragOffset;
  header.addEventListener('pointerdown', event => {
    if (compact.matches || event.button !== 0 || event.target.closest('button')) return;
    dragOffset = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove', event => {
    if (dragOffset) position(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
  });
  header.addEventListener('pointerup', () => {
    if (dragOffset) rememberGeometry();
    dragOffset = null;
  });
  header.addEventListener('pointercancel', () => {
    dragOffset = null;
  });

  header.addEventListener('keydown', event => {
    if (event.target !== header) return;
    const delta = WINDOW_MOVE_KEYS[event.key];
    if (delta) {
      event.preventDefault();
      position(panel.offsetLeft + delta[0], panel.offsetTop + delta[1]);
      rememberGeometry();
    }
  });

  window.addEventListener('resize', fitViewport, { signal });
  window.visualViewport?.addEventListener('resize', fitViewport, { signal });
  window.visualViewport?.addEventListener('scroll', fitViewport, { signal });
  compact.addEventListener('change', fitViewport, { signal });

  return {
    get isCompact() {
      return compact.matches;
    },
    fitViewport,
    offset() {
      const x = panel.offsetLeft;
      const y = panel.offsetTop;
      position(x + WINDOW_LAYOUT.cascadeOffset, y + WINDOW_LAYOUT.cascadeOffset);
      // Cascade inward when a window already touches the right or bottom edge.
      if (panel.offsetLeft === x && panel.offsetTop === y)
        position(x - WINDOW_LAYOUT.cascadeOffset, y - WINDOW_LAYOUT.cascadeOffset);
      rememberGeometry();
    },
    dispose() {
      rememberGeometry();
      resizeObserver.disconnect();
    },
  };
}
