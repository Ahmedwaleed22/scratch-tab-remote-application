import { LANGUAGE_BY_EXTENSION, MAX_HIGHLIGHT_LINE_LENGTH } from '../config/syntax.js';
import { MAX_FILE_BYTES } from '../config/editor.js';
import { highlightCode } from '../vendor/syntax.js';

export function languageFor(name) {
  const filename = name.split('/').pop().toLowerCase();
  if (!filename.includes('.')) return null;
  return LANGUAGE_BY_EXTENSION.get(filename.split('.').pop()) || null;
}

// A null result tells the view to paint literal text without tokenization.
export function highlightSyntax(text, language) {
  const exceedsFileLimit = text.length > MAX_FILE_BYTES;
  if (exceedsFileLimit) return null;

  const hasLongLine = text.split('\n').some(line => line.length > MAX_HIGHLIGHT_LINE_LENGTH);
  if (hasLongLine) return null;
  return highlightCode(text, language);
}
