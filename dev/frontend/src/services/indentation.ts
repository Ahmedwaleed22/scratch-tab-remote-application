export interface Indentation {
  size: number;
  spaces: boolean;
}
export interface TextEdit {
  start: number;
  end: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}
let remembered: Indentation = { size: 4, spaces: true };
export function indentationPreference(next?: Indentation): Indentation {
  try {
    if (next) localStorage.setItem('scratch-tab:indentation', JSON.stringify(next));
    else {
      const value: unknown = JSON.parse(localStorage.getItem('scratch-tab:indentation') || 'null');
      if (
        value &&
        typeof value === 'object' &&
        'size' in value &&
        'spaces' in value &&
        Number.isInteger(value.size) &&
        Number(value.size) >= 1 &&
        Number(value.size) <= 8 &&
        typeof value.spaces === 'boolean'
      )
        remembered = { size: Number(value.size), spaces: value.spaces };
    }
  } catch {
    // Storage restrictions must not prevent editing.
  }
  if (next) remembered = next;
  return { ...remembered };
}
export function detectIndentation(text: string, fallback: Indentation): Indentation {
  const prefixes = text
    .split('\n')
    .filter(line => line.trim())
    .map(line => /^[\t ]*/.exec(line)![0]);
  const tabs = prefixes.filter(prefix => prefix.startsWith('\t')).length;
  const spaces = prefixes.filter(prefix => prefix.startsWith(' '));
  if (tabs > spaces.length) return { ...fallback, spaces: false };
  const widths = spaces.map(prefix => prefix.length).filter(size => size > 0);
  if (!widths.length) return { ...fallback };
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const size = widths.reduce(gcd);
  return { spaces: true, size: size >= 1 && size <= 8 ? size : fallback.size };
}
export function indentationWidth(text: string, size: number): number {
  return [...text].reduce(
    (column, character) => column + (character === '\t' ? size - (column % size) : 1),
    0,
  );
}
export function indentationEdit(
  text: string,
  start: number,
  end: number,
  key: string,
  shift: boolean,
  settings: Indentation,
): TextEdit | null {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  if (key === 'Enter' && !shift) {
    const prefix = /^[\t ]*/.exec(text.slice(lineStart, start))![0];
    return {
      start,
      end,
      text: '\n' + prefix,
      selectionStart: start + prefix.length + 1,
      selectionEnd: start + prefix.length + 1,
    };
  }
  if (key !== 'Tab') return null;
  if (start === end && !shift) {
    const column = indentationWidth(text.slice(lineStart, start), settings.size);
    const insert = settings.spaces ? ' '.repeat(settings.size - (column % settings.size)) : '\t';
    return {
      start,
      end,
      text: insert,
      selectionStart: start + insert.length,
      selectionEnd: start + insert.length,
    };
  }
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const nextBreak = text.indexOf('\n', last);
  const blockEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, blockEnd).split('\n');
  let delta = 0;
  let firstDelta = 0;
  const replacement = lines
    .map((line, i) => {
      let changed: string;
      if (!shift) changed = (settings.spaces ? ' '.repeat(settings.size) : '\t') + line;
      else if (line.startsWith('\t')) changed = line.slice(1);
      else {
        const count = /^ */.exec(line)![0].length;
        const remove = Math.min(count, count % settings.size || settings.size);
        changed = line.slice(remove);
      }
      const difference = changed.length - line.length;
      delta += difference;
      if (i === 0) firstDelta = difference;
      return changed;
    })
    .join('\n');
  return {
    start: lineStart,
    end: blockEnd,
    text: replacement,
    selectionStart: Math.max(lineStart, start + firstDelta),
    selectionEnd: Math.max(lineStart, end + delta),
  };
}
export function convertIndentation(text: string, settings: Indentation): string {
  return text.replace(/^[\t ]+/gm, prefix => {
    const width = indentationWidth(prefix, settings.size);
    return settings.spaces
      ? ' '.repeat(width)
      : '\t'.repeat(Math.floor(width / settings.size)) + ' '.repeat(width % settings.size);
  });
}
