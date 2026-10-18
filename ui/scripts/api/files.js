export function createFiles(backend, projectId) {
  const call = body => backend.call('file', { projectId, method: 'POST', body });
  return {
    read: path => call({ path }),
    save: (path, content, revision) => call({ path, content, revision, save: true }),
  };
}
