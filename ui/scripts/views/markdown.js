import { MARKDOWN_EXTENSION } from '../config/syntax.js';
import { markdownPreview } from '../presenters/markdown.js';

export function createMarkdownPreview({ target, source, sourceSurface, actions, button }) {
  if (!MARKDOWN_EXTENSION.test(target.name)) return null;

  const preview = document.createElement('article');
  preview.className = 'scratch-tab-markdown';
  preview.setAttribute('aria-label', `${target.name} Markdown preview`);
  preview.tabIndex = 0;
  preview.hidden = true;
  let isPreview = false;

  const codeServerButton = actions.lastElementChild;
  const toggle = button(
    'Preview',
    () => {
      isPreview = !isPreview;
      if (isPreview) refresh();
      sourceSurface.hidden = isPreview;
      preview.hidden = !isPreview;
      toggle.textContent = isPreview ? 'Source' : 'Preview';
      toggle.setAttribute(
        'aria-label',
        isPreview ? 'Show Markdown source' : 'Show Markdown preview',
      );
      toggle.setAttribute('aria-pressed', String(isPreview));
      toggle.title = isPreview
        ? 'Show unformatted Markdown source'
        : 'Show formatted Markdown preview';
      (isPreview ? preview : source).focus({ preventScroll: true });
    },
    actions,
  );
  actions.insertBefore(toggle, codeServerButton);
  toggle.disabled = true;
  toggle.setAttribute('aria-label', 'Show Markdown preview');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.title = 'Show formatted Markdown preview';

  function refresh() {
    if (isPreview) preview.innerHTML = markdownPreview(source.value, target);
  }

  return {
    element: preview,
    get isPreview() {
      return isPreview;
    },
    enable() {
      toggle.disabled = false;
    },
    refresh,
    remove() {
      preview.remove();
      toggle.remove();
    },
  };
}
