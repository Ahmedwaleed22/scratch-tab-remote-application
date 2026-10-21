import type { FileIconStyle } from '../model/files/application/icon.js';
import { ICON_BY_LANGUAGE, NODE_ICON, NODE_PACKAGE_FILE } from '../config/fileIcons.js';
import { languageFor } from './syntax.js';

/** Returns null for files drawn with the plain document icon. */
export function fileIconFor(name: string): Readonly<FileIconStyle> | null {
  if (NODE_PACKAGE_FILE.test(name)) return NODE_ICON;
  const language = languageFor(name);
  return language ? ICON_BY_LANGUAGE[language] : null;
}
