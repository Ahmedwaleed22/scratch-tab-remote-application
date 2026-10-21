// Closed until the user opens it, then remembered in this browser.
let remembered = false;
const key = 'scratch-tab:file-sidebar';

interface SidebarPreference {
  read(): boolean;
  write(open: boolean): void;
}

export const sidebarPreference: SidebarPreference = {
  read(): boolean {
    try {
      const value = localStorage.getItem(key);
      if (value === 'open' || value === 'closed') remembered = value === 'open';
    } catch {
      // Keep the choice in memory when browser storage is unavailable.
    }
    return remembered;
  },
  write(open: boolean): void {
    remembered = open;
    try {
      localStorage.setItem(key, open ? 'open' : 'closed');
    } catch {
      // Storage restrictions must not prevent toggling the sidebar.
    }
  },
};
