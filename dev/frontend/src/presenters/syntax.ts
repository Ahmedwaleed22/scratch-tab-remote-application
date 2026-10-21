import { LANGUAGE_BY_EXTENSION, MAX_HIGHLIGHT_LINE_LENGTH } from '../config/syntax.js';
import { MAX_FILE_BYTES } from '../config/editor.js';
import { highlightCode } from '../vendor/syntax.js';
import type { SyntaxLanguage } from '../model/editor/application/syntax.js';

export function languageFor(name: string): SyntaxLanguage | null {
  const filename = name.slice(name.lastIndexOf('/') + 1).toLowerCase();
  if (!filename.includes('.')) return null;
  return LANGUAGE_BY_EXTENSION.get(filename.slice(filename.lastIndexOf('.') + 1)) || null;
}

// A null result tells the view to paint literal text without tokenization.
export function highlightSyntax(text: string, language: SyntaxLanguage): string | null {
  const exceedsFileLimit = text.length > MAX_FILE_BYTES;
  if (exceedsFileLimit) return null;

  const hasLongLine = text.split('\n').some(line => line.length > MAX_HIGHLIGHT_LINE_LENGTH);
  if (hasLongLine) return null;
  return highlightCode(text, language);
}
