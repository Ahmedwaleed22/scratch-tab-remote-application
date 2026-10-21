import type { FileTarget } from '../types.js';
import { renderMarkdown } from '../vendor/markdown.js';

// Keep relative workspace resources in Remote; never navigate to host filesystem paths.
function resolveMarkdownUrl(
  value: string,
  image: boolean,
  target: Pick<FileTarget, 'path' | 'download'>,
): string | null {
  if (/^https?:/i.test(value)) return value;
  if (!image && /^(mailto:|#)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(value)) return null;

  try {
    const resource = new URL(value, `https://workspace.invalid${target.path}`);
    const path = decodeURIComponent(resource.pathname);
    if (!path.startsWith('/workspace/')) return null;
    if (path.includes('\0') || path.split('/').some(part => part === '..' || part === '.'))
      return null;
    const link = new URL(target.download, 'https://remote.invalid');
    link.searchParams.set('path', image ? path.slice('/workspace/'.length) : path);
    if (!image) link.pathname = link.pathname.replace(/\/files\/download$/, '/ide-open');
    return link.pathname + link.search;
  } catch {
    return null;
  }
}

export function markdownPreview(
  text: string,
  target: Pick<FileTarget, 'path' | 'download'>,
): string {
  return renderMarkdown(text, (value, image) => resolveMarkdownUrl(value, image, target));
}
