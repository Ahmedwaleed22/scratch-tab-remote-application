let remembered = true;
const key = 'scratch-tab:markdown-view';

interface MarkdownPreference {
  read(): boolean;
  write(preview: boolean): void;
}

export const markdownPreference: MarkdownPreference = {
  read(): boolean {
    try {
      const value = localStorage.getItem(key);
      if (value === 'preview' || value === 'source') remembered = value === 'preview';
    } catch {
      // Keep the choice in memory when browser storage is unavailable.
    }
    return remembered;
  },
  write(preview: boolean): void {
    remembered = preview;
    try {
      localStorage.setItem(key, preview ? 'preview' : 'source');
    } catch {
      // Storage restrictions must not prevent switching views.
    }
  },
};
