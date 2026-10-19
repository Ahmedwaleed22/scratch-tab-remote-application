import { highlightSyntax, languageFor } from '../presenters/syntax.js';

// The textarea owns editing, selection, undo and accessibility. The layer only paints.
export function createSyntaxSurface(textarea, name, signal) {
  const language = languageFor(name);
  if (!language) return null;
  const surface = document.createElement('div');
  surface.className = 'scratch-tab-codearea';
  surface.dataset.language = language;
  const highlightLayer = document.createElement('pre');
  highlightLayer.setAttribute('aria-hidden', 'true');
  surface.append(highlightLayer, textarea);
  let pendingFrame = 0;
  let isDisposed = false;

  function synchronizeViewport() {
    highlightLayer.style.width = `${textarea.clientWidth}px`;
    highlightLayer.style.height = `${textarea.clientHeight}px`;
    highlightLayer.scrollTop = textarea.scrollTop;
    highlightLayer.scrollLeft = textarea.scrollLeft;
  }
  function refresh() {
    if (isDisposed) return;
    const text = textarea.value;
    const highlighted = highlightSyntax(text, language);
    if (highlighted === null) {
      highlightLayer.textContent = text + '\n';
    } else {
      highlightLayer.innerHTML = highlighted + '\n';
    }
    synchronizeViewport();
  }
  function scheduleHighlight() {
    if (pendingFrame || isDisposed) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      refresh();
    });
  }
  const resizeObserver = new ResizeObserver(synchronizeViewport);
  resizeObserver.observe(textarea);
  textarea.addEventListener('input', scheduleHighlight, { signal });
  textarea.addEventListener('scroll', synchronizeViewport, { signal });
  function dispose() {
    isDisposed = true;
    cancelAnimationFrame(pendingFrame);
    resizeObserver.disconnect();
  }
  signal.addEventListener('abort', dispose, { once: true });
  return { element: surface, refresh, dispose };
}
