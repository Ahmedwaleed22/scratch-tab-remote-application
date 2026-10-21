import type { EditorSnapshot } from './document.js';
import type { Tab } from '../../../types.js';

export interface EditorWindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type EditorWindowGeometry = Record<keyof EditorWindowBounds, string>;

export interface EditorWindowState extends EditorSnapshot {
  preview: boolean;
  tabs: Tab[];
  activePath: string | null;
}
