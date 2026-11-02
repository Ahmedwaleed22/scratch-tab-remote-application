const prefix = 'scratch-tab:panel-size:';

// Sizes are shared by every Scratch Tab window in this browser, like VS Code's sidebar width.
export const panelSize = {
  read(name: string): number | null {
    try {
      const value = Number(localStorage.getItem(prefix + name));
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  },
  write(name: string, size: number | null): void {
    try {
      if (size === null) localStorage.removeItem(prefix + name);
      else localStorage.setItem(prefix + name, String(Math.round(size)));
    } catch {
      // Resizing still works for this session when storage is unavailable.
    }
  },
};
