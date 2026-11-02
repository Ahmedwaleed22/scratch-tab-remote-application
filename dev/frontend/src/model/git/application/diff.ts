export type DiffLineKind = 'context' | 'add' | 'delete';
export interface DiffLine {
  kind: DiffLineKind;
  old?: number;
  new?: number;
  text: string;
  /** Changed character range `[start, end)` when the line pairs with a similar line on the other side. */
  changed?: [number, number];
  noNewline?: boolean;
}
export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}
export interface ParsedDiff {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  binary: boolean;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  renamedFrom?: string;
}
export interface SplitRow {
  left?: DiffLine;
  right?: DiffLine;
}

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parses one file of `git diff` output, dropping the headers GitHub hides. */
export function parseDiff(text: string): ParsedDiff {
  const result: ParsedDiff = {
    hunks: [],
    additions: 0,
    deletions: 0,
    binary: false,
    status: 'modified',
  };
  let hunk: DiffHunk | null = null;
  let previous: DiffLine | null = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of text.split('\n')) {
    const header = hunkHeader.exec(line);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk = { header: line, lines: [] };
      result.hunks.push(hunk);
      previous = null;
      continue;
    }
    if (!hunk) {
      if (line.startsWith('new file mode') || line === '--- /dev/null') result.status = 'added';
      else if (line.startsWith('deleted file mode') || line === '+++ /dev/null')
        result.status = 'deleted';
      else if (line.startsWith('rename from ')) {
        result.status = 'renamed';
        result.renamedFrom = line.slice(12);
      } else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch'))
        result.binary = true;
      continue;
    }
    if (line.startsWith('\\')) {
      if (previous) previous.noNewline = true;
      continue;
    }
    const marker = line[0];
    if (marker === '+') {
      previous = { kind: 'add', new: newLine++, text: line.slice(1) };
      result.additions++;
    } else if (marker === '-') {
      previous = { kind: 'delete', old: oldLine++, text: line.slice(1) };
      result.deletions++;
    } else if (marker === ' ') {
      previous = { kind: 'context', old: oldLine++, new: newLine++, text: line.slice(1) };
    } else continue;
    hunk.lines.push(previous);
  }
  for (const { lines } of result.hunks) markChangedWords(lines);
  return result;
}

/** Pairs each deletion run with the addition run that follows it, like GitHub's split view. */
export function changeRuns(lines: DiffLine[]): (DiffLine | [DiffLine[], DiffLine[]])[] {
  const runs: (DiffLine | [DiffLine[], DiffLine[]])[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    if (line.kind === 'context') {
      runs.push(line);
      i++;
      continue;
    }
    const deleted: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (lines[i]?.kind === 'delete') deleted.push(lines[i++]!);
    while (lines[i]?.kind === 'add') added.push(lines[i++]!);
    runs.push([deleted, added]);
  }
  return runs;
}

export function splitRows(lines: DiffLine[]): SplitRow[] {
  return changeRuns(lines).flatMap(run => {
    if (!Array.isArray(run)) return [{ left: run, right: run }];
    const [deleted, added] = run;
    return Array.from({ length: Math.max(deleted.length, added.length) }, (_, i) => ({
      ...(deleted[i] ? { left: deleted[i] } : {}),
      ...(added[i] ? { right: added[i] } : {}),
    }));
  });
}

function markChangedWords(lines: DiffLine[]): void {
  for (const run of changeRuns(lines)) {
    if (!Array.isArray(run)) continue;
    const [deleted, added] = run;
    for (let i = 0; i < Math.min(deleted.length, added.length); i++) {
      const before = deleted[i]!;
      const after = added[i]!;
      let start = 0;
      while (
        start < before.text.length &&
        start < after.text.length &&
        before.text[start] === after.text[start]
      )
        start++;
      let end = 0;
      while (
        end < before.text.length - start &&
        end < after.text.length - start &&
        before.text[before.text.length - 1 - end] === after.text[after.text.length - 1 - end]
      )
        end++;
      // Only highlight when the lines are recognisably the same line edited in place.
      const shared = start + end;
      if (!shared || shared < Math.min(before.text.length, after.text.length) / 3) continue;
      // Widen to word boundaries so highlights cover whole identifiers.
      const word = /[\w$]/;
      while (start > 0 && word.test(before.text[start - 1]!) && word.test(after.text[start - 1]!))
        start--;
      before.changed = [start, before.text.length - end];
      after.changed = [start, after.text.length - end];
    }
  }
}
