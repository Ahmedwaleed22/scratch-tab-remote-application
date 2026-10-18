// Package mutations use Remote's authenticated admin API, never host credentials.
export function createUpdates(backend, projectId, signal) {
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    if (!response.ok) {
      if (response.status === 403) throw new Error('Only administrators can update Scratch Tab.');
      throw new Error(`Remote returned HTTP ${response.status}. Check Applications before retrying.`);
    }
    return response.json();
  }
  return {
    latest: () => backend.call('updates', { projectId, signal }),
    packages: () => request('/api/applications/packages', { signal }),
    async install(version, beforeUpload) {
      const response = await backend.fetch('updates/archive', { projectId, method: 'POST', body: { version }, signal });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Could not download the verified release ZIP.');
      }
      const form = new FormData();
      form.append('package', await response.blob(), `scratch-tab-${version}.zip`);
      beforeUpload();
      // Once submitted, allow Remote to finish even if the update popup is closed.
      return request('/api/applications/packages', { method: 'POST', body: form });
    },
  };
}
