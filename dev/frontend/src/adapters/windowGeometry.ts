import { WINDOW_LAYOUT, WINDOW_GEOMETRY_PROPERTIES } from '../config/windowLayout.js';
import type {
  EditorWindowBounds,
  EditorWindowGeometry,
} from '../model/editor/application/window.js';
import type { WindowGeometryPersistence } from '../port/editor/outbound/layout.js';
import { isJsonObject } from '../shared/json.js';

function isWindowBounds(value: unknown): value is EditorWindowBounds {
  if (!isJsonObject(value)) return false;
  return WINDOW_GEOMETRY_PROPERTIES.every(name => {
    const coordinate = value[name];
    return typeof coordinate === 'number' && Number.isFinite(coordinate);
  });
}

// Store layout only, never document content. Storage may be disabled by the browser.
export function windowGeometry(projectId?: string): WindowGeometryPersistence {
  const key = `scratch-tab:window-geometry:${projectId}`;

  return {
    read(): EditorWindowGeometry | null {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (!isWindowBounds(value)) return null;

        const isTooSmall =
          value.width < WINDOW_LAYOUT.minimumWidth || value.height < WINDOW_LAYOUT.minimumHeight;
        if (isTooSmall) return null;

        return {
          left: `${value.left}px`,
          top: `${value.top}px`,
          width: `${value.width}px`,
          height: `${value.height}px`,
        };
      } catch {
        return null;
      }
    },
    write(value: EditorWindowBounds): void {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Editing remains available when storage is full or blocked.
      }
    },
  };
}
