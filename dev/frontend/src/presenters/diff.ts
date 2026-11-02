import type { DiffHunk, DiffLine } from '../model/git/application/diff.js';
import { highlightSyntax, languageFor } from './syntax.js';

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
}

/** Splits highlighted HTML into lines, closing and reopening spans that cross a line break. */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let line = '';
  for (const [token] of html.matchAll(/<span[^>]*>|<\/span>|\n|[^<\n]+/g)) {
    if (token === '\n') {
      lines.push(line + '</span>'.repeat(open.length));
      line = open.join('');
      continue;
    }
    if (token.startsWith('<span')) open.push(token);
    else if (token === '</span>') open.pop();
    line += token;
  }
  lines.push(line);
  return lines;
}

/** Wraps the characters `[start, end)` of a line's text in `<mark>`, keeping its markup intact. */
export function markRange(html: string, [start, end]: [number, number]): string {
  if (start >= end) return html;
  let position = 0;
  let marking = false;
  let result = '';
  for (const [token] of html.matchAll(/<[^>]+>|&#?\w+;|[^<&]/g)) {
    if (marking && position === end) {
      result += '</mark>';
      marking = false;
    }
    if (token.startsWith('<')) {
      result += marking ? `</mark>${token}<mark>` : token;
      continue;
    }
    if (position === start) {
      result += '<mark>';
      marking = true;
    }
    result += token;
    position++;
  }
  return result + (marking ? '</mark>' : '');
}

/** Highlights each side of every hunk as one block so multi-line strings and comments keep their colour. */
export function renderDiffLines(hunks: DiffHunk[], path: string): Map<DiffLine, string> {
  const language = languageFor(path);
  const rendered = new Map<DiffLine, string>();
  for (const { lines } of hunks)
    for (const side of [
      lines.filter(line => line.kind !== 'add'),
      lines.filter(line => line.kind !== 'delete'),
    ]) {
      const text = side.map(line => line.text).join('\n');
      const highlighted = language ? highlightSyntax(text, language) : null;
      const html =
        highlighted === null
          ? side.map(line => escapeHtml(line.text))
          : splitHighlightedLines(highlighted);
      side.forEach((line, index) => {
        if (rendered.has(line)) return;
        const value = html[index] ?? escapeHtml(line.text);
        rendered.set(line, line.changed ? markRange(value, line.changed) : value);
      });
    }
  return rendered;
}
