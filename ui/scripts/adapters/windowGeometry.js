import { WINDOW_LAYOUT, WINDOW_GEOMETRY_PROPERTIES } from '../config/windowLayout.js';

// Store layout only, never document content. Storage may be disabled by the browser.
export function windowGeometry(projectId) {
  const key = `scratch-tab:window-geometry:${projectId}`;

  return {
    read() {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (!value) return null;

        const hasFiniteCoordinates = WINDOW_GEOMETRY_PROPERTIES.every(name =>
          Number.isFinite(value[name]),
        );
        if (!hasFiniteCoordinates) return null;

        const isTooSmall =
          value.width < WINDOW_LAYOUT.minimumWidth || value.height < WINDOW_LAYOUT.minimumHeight;
        if (isTooSmall) return null;

        return Object.fromEntries(
          Object.entries(value)
            .filter(([name]) => WINDOW_GEOMETRY_PROPERTIES.includes(name))
            .map(([name, number]) => [name, `${number}px`]),
        );
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Editing remains available when storage is full or blocked.
      }
    },
  };
}
