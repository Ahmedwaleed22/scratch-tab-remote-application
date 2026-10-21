import type { SyntaxLanguage } from '../model/editor/application/syntax.js';

export interface FileIconStyle {
  /** Short glyph drawn inside the badge. */
  label: string;
  color: string;
  /** Node package files use the hexagon badge. */
  shape: 'badge' | 'hexagon';
}

export const NODE_PACKAGE_FILE: RegExp = /^(package(-lock)?\.json|npm-shrinkwrap\.json)$/i;

export const NODE_ICON: Readonly<FileIconStyle> = {
  label: 'JS',
  color: '#8cc84b',
  shape: 'hexagon',
};

export const ICON_BY_LANGUAGE: Readonly<Record<SyntaxLanguage, FileIconStyle>> = {
  javascript: { label: 'JS', color: '#e8d44d', shape: 'badge' },
  typescript: { label: 'TS', color: '#3d8fd6', shape: 'badge' },
  python: { label: 'PY', color: '#4b8bbe', shape: 'badge' },
  go: { label: 'GO', color: '#00add8', shape: 'badge' },
  json: { label: '{}', color: '#cbcb41', shape: 'badge' },
  bash: { label: '$', color: '#89e051', shape: 'badge' },
  xml: { label: '<>', color: '#e44d26', shape: 'badge' },
  css: { label: '#', color: '#42a5f5', shape: 'badge' },
  markdown: { label: 'M', color: '#519aba', shape: 'badge' },
  yaml: { label: 'Y', color: '#cb4b5d', shape: 'badge' },
  sql: { label: 'DB', color: '#e38c00', shape: 'badge' },
  rust: { label: 'RS', color: '#dea584', shape: 'badge' },
  java: { label: 'J', color: '#e76f00', shape: 'badge' },
  cpp: { label: 'C', color: '#659ad2', shape: 'badge' },
  php: { label: 'P', color: '#8892bf', shape: 'badge' },
};
