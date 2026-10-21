import type {
  EditorWindowBounds,
  EditorWindowGeometry,
} from '../../../model/editor/application/window.js';

export interface WindowGeometryPersistence {
  read(): EditorWindowGeometry | null;
  write(bounds: EditorWindowBounds): void;
}
