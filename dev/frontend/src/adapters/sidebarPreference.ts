import type { SidebarPreference } from '../port/files/outbound/preference.js';
import { SIDEBAR_STORAGE_KEY } from '../config/constants/files.js';

// Closed until the user opens it, then remembered in this browser.
let remembered = false;

export const sidebarPreference: SidebarPreference = {
  read(): boolean {
    try {
      const value = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (value === 'open' || value === 'closed') remembered = value === 'open';
    } catch {
      // Keep the choice in memory when browser storage is unavailable.
    }
    return remembered;
  },
  write(open: boolean): void {
    remembered = open;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? 'open' : 'closed');
    } catch {
      // Storage restrictions must not prevent toggling the sidebar.
    }
  },
};
