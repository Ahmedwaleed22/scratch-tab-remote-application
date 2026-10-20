import type { EditorSnapshot } from './document.js';
import type { Tab } from '../../../types.js';

export type EditorWindowGeometry = Record<'left' | 'top' | 'width' | 'height', string>;

export interface EditorWindowState extends EditorSnapshot {
  preview: boolean;
  tabs: Tab[];
  activePath: string | null;
}
