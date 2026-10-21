import type { Remote, Files, FileRead, FileSaved } from '../types.js';
import type { FileReadRequest, FileSaveRequest } from '../model/editor/api/files.js';
import { isJsonObject } from '../shared/json.js';

export function createFiles(backend: Remote['backend'], projectId: string): Files {
  const call = (body: FileReadRequest | FileSaveRequest): Promise<unknown> =>
    backend.call<unknown>('file', { projectId, method: 'POST', body });
  return {
    async read(path): Promise<FileRead> {
      const result = await call({ path });
      if (
        !isJsonObject(result) ||
        typeof result.content !== 'string' ||
        typeof result.revision !== 'string'
      )
        throw new Error('Unexpected file response.');
      return { content: result.content, revision: result.revision };
    },
    async save(path, content, revision, create = false): Promise<FileSaved> {
      const result = await call(
        create
          ? { path, content, revision, save: true, create: true }
          : { path, content, revision, save: true },
      );
      if (!isJsonObject(result) || typeof result.revision !== 'string')
        throw new Error('Unexpected save response.');
      return { revision: result.revision };
    },
  };
}
