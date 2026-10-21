import type { Directories, DirectoryEntry } from '../types.js';
import { isJsonObject } from '../shared/json.js';

// Remote's file manager listing; the browser session already authorizes it.
export function createDirectories(): Directories {
  return {
    async list(chatId, relative, signal): Promise<DirectoryEntry[]> {
      const query = relative ? `?path=${encodeURIComponent(relative)}` : '';
      const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/files${query}`, {
        credentials: 'same-origin',
        signal,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          isJsonObject(result) && typeof result.error === 'string'
            ? result.error
            : `Cannot list folder (${response.status}).`,
        );
      if (!isJsonObject(result) || !Array.isArray(result.entries))
        throw new Error('Unexpected folder response.');
      const entries: readonly unknown[] = result.entries;
      return entries.flatMap(entry =>
        isJsonObject(entry) &&
        typeof entry.name === 'string' &&
        typeof entry.path === 'string' &&
        typeof entry.isDir === 'boolean'
          ? [{ name: entry.name, path: entry.path, isDir: entry.isDir }]
          : [],
      );
    },
  };
}
