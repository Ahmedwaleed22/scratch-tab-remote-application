import type { DirectoryEntry } from '../../../model/files/application/directory.js';

export interface Directories {
  list(chatId: string, relative: string, signal?: AbortSignal): Promise<DirectoryEntry[]>;
  downloadUrl(chatId: string, relative: string): string;
}
