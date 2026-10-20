import type { Remote, Files, FileRead } from '../types.js';
export function createFiles(backend: Remote['backend'], projectId: string): Files {
  const call = <T>(body: unknown) => backend.call<T>('file', { projectId, method: 'POST', body });
  return {
    read: path => call<FileRead>({ path }),
    save: (path, content, revision) =>
      call<{ revision: string }>({ path, content, revision, save: true }),
  };
}
