import type { FileTarget } from './types.js';
export function fileTarget(
  href: string,
  origin: string,
  chatId: string,
  cwd = '',
): FileTarget | null {
  try {
    const url = new URL(href, origin);
    const base = new URL(origin);
    const project = /^\/var\/lib\/remote\/projects\/([a-z0-9][a-z0-9-]*)\/workspace(?:\/|$)/.exec(
      cwd,
    );
    let raw;
    if (
      url.origin === origin &&
      url.pathname === `/api/chats/${encodeURIComponent(chatId)}/ide-open`
    ) {
      raw = url.searchParams.get('path') || '';
    } else if (
      project &&
      url.protocol === base.protocol &&
      url.port === base.port &&
      ((url.hostname === `code--${project[1]}.${base.hostname}` &&
        (url.pathname === '/_static/remote-open.html' || url.pathname === '/')) ||
        (url.hostname === `code.${base.hostname}` && url.pathname === `/${project[1]}/`))
    ) {
      raw = url.searchParams.get('file');
      if (!raw) {
        const payload = JSON.parse(url.searchParams.get('payload') || '[]');
        if (!Array.isArray(payload)) return null;
        const file = payload.find(pair => Array.isArray(pair) && pair[0] === 'openFile')?.[1];
        if (typeof file !== 'string') return null;
        const uri = new URL(file);
        if (uri.protocol !== 'vscode-remote:' || uri.host !== url.host) return null;
        raw = decodeURIComponent(uri.pathname);
      }
    } else return null;
    let path = raw.replace(/(:\d+){1,2}$/, '');
    // Older links can contain host paths; translate only this project's workspace.
    if (project) {
      const hostRoot = `/var/lib/remote/projects/${project[1]}/workspace/`;
      if (path.startsWith(hostRoot)) path = `/workspace/${path.slice(hostRoot.length)}`;
    }
    if (!path.startsWith('/workspace/') || path.endsWith('/')) return null;
    const relative = path.slice('/workspace/'.length);
    if (
      relative.split('/').some(part => part === '..' || part === '.' || part === '') ||
      path.includes('\0')
    )
      return null;
    return {
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
      ide: url.href,
      download: `/api/chats/${encodeURIComponent(chatId)}/files/download?path=${encodeURIComponent(relative)}`,
    };
  } catch {
    return null;
  }
}
