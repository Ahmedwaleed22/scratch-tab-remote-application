import type { Remote } from '../types.js';
import type { Directories } from '../port/files/outbound/directories.js';
import type { DirectoryEntry } from '../model/files/application/directory.js';
import { isJsonObject } from '../shared/json.js';

// Listings belong to Scratch's project backend; chat download links remain host-owned.
export function createDirectories(backend: Remote['backend'], projectId: string): Directories {
  return {
    downloadUrl: (chatId, relative) =>
      `/api/chats/${encodeURIComponent(chatId)}/files/download?path=${encodeURIComponent(relative)}`,
    async list(chatId, relative, signal): Promise<DirectoryEntry[]> {
      const result = await backend.call<unknown>('file', {
        projectId,
        method: 'POST',
        body: { list: true, path: '/workspace/' + relative },
        signal,
      });
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
