import { fileTarget } from '../links.js';
import { MEDIA_OR_ARCHIVE } from '../config/editor.js';

export function captureFileOpenings(context, signal, onOpen) {
  let openingOriginal = false;
  function intercept(event) {
    if (
      openingOriginal ||
      event.defaultPrevented ||
      (event.type === 'click' && event.button !== 0) ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const element = event.target instanceof Element ? event.target : null;
    if (!element) return;
    let anchor = element.closest('a[href]');
    let target =
      anchor && event.type === 'click'
        ? fileTarget(anchor.href, location.origin, context.chatId, context.cwd)
        : null;
    if (!anchor && !element.closest('button,input,textarea,select')) {
      const row = element.closest('[role="button"]');
      if (row?.closest('#workspace-files-pane')) {
        const download = row.querySelector('a[download][href]');
        if (download) {
          const url = new URL(download.href, location.origin);
          const relative = url.searchParams.get('path');
          if (
            url.origin === location.origin &&
            url.pathname === `/api/chats/${encodeURIComponent(context.chatId)}/files/download` &&
            relative &&
            !relative.startsWith('/') &&
            !MEDIA_OR_ARCHIVE.test(relative) &&
            !row.title.startsWith('View ')
          ) {
            target = fileTarget(
              `/api/chats/${encodeURIComponent(context.chatId)}/ide-open?path=${encodeURIComponent('/workspace/' + relative)}`,
              location.origin,
              context.chatId,
              context.cwd,
            );
            if (target) {
              anchor = row;
              target.openIde = () => {
                openingOriginal = true;
                try {
                  row.click();
                } finally {
                  openingOriginal = false;
                }
              };
            }
          }
        }
      }
    }
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onOpen(anchor, target);
  }
  document.addEventListener('click', intercept, { capture: true, signal });
  document.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Enter' || event.key === ' ') intercept(event);
    },
    { capture: true, signal },
  );
}
