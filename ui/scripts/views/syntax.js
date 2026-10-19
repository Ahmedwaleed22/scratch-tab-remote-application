import { highlightCode, languageFor } from '../vendor/syntax.js';
import { MAX_FILE_BYTES } from '../config/editor.js';

// The textarea owns editing, selection, undo and accessibility. The layer only paints.
export function createSyntaxSurface(textarea, name, signal) {
  const language = languageFor(name);
  if (!language) return { element: textarea, refresh() {}, dispose() {} };
  const surface = document.createElement('div');
  surface.className = 'scratch-tab-codearea';
  surface.dataset.language = language;
  const paint = document.createElement('pre');
  paint.setAttribute('aria-hidden', 'true');
  surface.append(paint, textarea);
  let frame = 0,
    disposed = false;
  function sync() {
    paint.style.width = `${textarea.clientWidth}px`;
    paint.style.height = `${textarea.clientHeight}px`;
    paint.scrollTop = textarea.scrollTop;
    paint.scrollLeft = textarea.scrollLeft;
  }
  function refresh() {
    if (disposed) return;
    const text = textarea.value;
    // Large drafts and minified lines stay readable without expensive parsing.
    if (text.length > MAX_FILE_BYTES || text.split('\n').some(line => line.length > 8192))
      paint.textContent = text + '\n';
    else paint.innerHTML = highlightCode(text, language) + '\n';
    sync();
  }
  function schedule() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  }
  const observer = new ResizeObserver(sync);
  observer.observe(textarea);
  textarea.addEventListener('input', schedule, { signal });
  textarea.addEventListener('scroll', sync, { signal });
  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
  }
  signal.addEventListener('abort', dispose, { once: true });
  return { element: surface, refresh, dispose };
}
