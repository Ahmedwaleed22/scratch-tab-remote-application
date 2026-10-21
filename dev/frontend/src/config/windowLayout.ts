import type { EditorWindowBounds } from '../model/editor/application/window.js';

interface WindowLayoutSettings {
  compactQuery: string;
  viewportMargin: number;
  visibleTitleWidth: number;
  cascadeOffset: number;
  minimumWidth: number;
  minimumHeight: number;
  initialLeft: number;
  initialTop: number;
  initialHorizontalRoom: number;
  initialVerticalRoom: number;
}

export const WINDOW_LAYOUT: Readonly<WindowLayoutSettings> = {
  compactQuery: '(max-width: 600px), (pointer: coarse) and (max-height: 500px)',
  viewportMargin: 8,
  visibleTitleWidth: 72,
  cascadeOffset: 24,
  minimumWidth: 280,
  minimumHeight: 180,
  initialLeft: 48,
  initialTop: 90,
  initialHorizontalRoom: 350,
  initialVerticalRoom: 200,
};

export const WINDOW_GEOMETRY_PROPERTIES: readonly (keyof EditorWindowBounds)[] = [
  'left',
  'top',
  'width',
  'height',
];
export const WINDOW_MOVE_KEYS: Readonly<Record<string, readonly [number, number] | undefined>> = {
  ArrowLeft: [-20, 0],
  ArrowRight: [20, 0],
  ArrowUp: [0, -20],
  ArrowDown: [0, 20],
};
