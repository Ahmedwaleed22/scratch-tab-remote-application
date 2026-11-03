import { useState } from 'preact/hooks';
import { panelSize } from '../adapters/panelSize.js';

export interface PanelSize {
  /** Pixels chosen by the user; `null` means the stylesheet default. */
  size: number | null;
  resize(size: number | null): void;
}

export function usePanelSize(name: string): PanelSize {
  const [size, setSize] = useState(() => panelSize.read(name));
  return {
    size,
    resize(next) {
      setSize(next);
      panelSize.write(name, next);
    },
  };
}
