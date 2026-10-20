let remembered = true;
const key = 'scratch-tab:markdown-view';

export const markdownPreference = {
  read(): boolean {
    try {
      const value = localStorage.getItem(key);
      if (value === 'preview' || value === 'source') remembered = value === 'preview';
    } catch {
      // Keep the choice in memory when browser storage is unavailable.
    }
    return remembered;
  },
  write(preview: boolean) {
    remembered = preview;
    try {
      localStorage.setItem(key, preview ? 'preview' : 'source');
    } catch {
      // Storage restrictions must not prevent switching views.
    }
  },
};
