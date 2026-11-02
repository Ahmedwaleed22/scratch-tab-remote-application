import type { JSX } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GitController } from '../hooks/useGit.js';
import {
  parseDiff,
  splitRows,
  type DiffLine,
  type ParsedDiff,
} from '../model/git/application/diff.js';
import { renderDiffLines } from '../presenters/diff.js';
import Button from './Button.js';
import GitIcon from './GitIcon.js';

type View = 'unified' | 'split';
const preferenceKey = 'scratch-tab:git-diff';
const narrowWidth = 600;

function loadPreferences(): { view: View; wrap: boolean } {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
    if (stored && typeof stored === 'object')
      return {
        view: 'view' in stored && stored.view === 'split' ? 'split' : 'unified',
        wrap: 'wrap' in stored && stored.wrap === true,
      };
  } catch {
    // Storage can be unavailable or hold an older shape; defaults are fine.
  }
  return { view: 'unified', wrap: false };
}

function DiffStat({ diff }: { diff: ParsedDiff }): JSX.Element {
  const total = diff.additions + diff.deletions;
  const scale = total > 5 ? 5 / total : 1;
  let added = Math.round(diff.additions * scale);
  let deleted = Math.round(diff.deletions * scale);
  if (diff.additions && !added) added = 1;
  if (diff.deletions && !deleted) deleted = 1;
  if (added + deleted > 5) diff.additions > diff.deletions ? added-- : deleted--;
  return (
    <span
      class="scratch-tab-diff-stat"
      role="img"
      aria-label={`${diff.additions} ${diff.additions === 1 ? 'addition' : 'additions'}, ${diff.deletions} ${diff.deletions === 1 ? 'deletion' : 'deletions'}`}
    >
      <span class="scratch-tab-diff-count-add">+{diff.additions}</span>
      <span class="scratch-tab-diff-count-delete">−{diff.deletions}</span>
      <span class="scratch-tab-diff-blocks" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} data-kind={i < added ? 'add' : i < added + deleted ? 'delete' : undefined} />
        ))}
      </span>
    </span>
  );
}

function Code({
  line,
  html,
}: {
  line: DiffLine | undefined;
  html: Map<DiffLine, string>;
}): JSX.Element {
  if (!line) return <td class="scratch-tab-diff-code" data-kind="empty" />;
  return (
    <td
      class="scratch-tab-diff-code"
      data-kind={line.kind}
      data-marker={line.kind === 'add' ? '+' : line.kind === 'delete' ? '-' : ' '}
    >
      <span dangerouslySetInnerHTML={{ __html: html.get(line) ?? '' }} />
      {line.noNewline && (
        <span
          class="scratch-tab-diff-eof"
          role="img"
          aria-label="No newline at end of file"
          title="No newline at end of file"
        >
          ⊘
        </span>
      )}
    </td>
  );
}

const LineNumber = ({ line, value }: { line: DiffLine | undefined; value: number | undefined }) => (
  <td class="scratch-tab-diff-number" data-kind={line?.kind ?? 'empty'} data-line={value} />
);

export default function GitDiff({ git }: { git: GitController }): JSX.Element | null {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [narrow, setNarrow] = useState(false);
  const root = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const preview = git.open ? git.preview : null;
  const prepared = useRef(new Map<string, { diff: ParsedDiff; html: Map<DiffLine, string> }>());
  const empty = useMemo(() => ({ diff: parseDiff(''), html: new Map<DiffLine, string>() }), []);
  const presentation = useMemo(() => {
    if (!preview || preview.loading) return empty;
    const key = preview.path + '\0' + preview.text;
    const cached = prepared.current.get(key);
    if (cached) return cached;
    const diff = parseDiff(preview.text);
    const value = { diff, html: renderDiffLines(diff.hunks, preview.path) };
    prepared.current.set(key, value);
    if (prepared.current.size > 4) {
      const oldest = prepared.current.keys().next().value;
      if (oldest !== undefined) prepared.current.delete(oldest);
    }
    return value;
  }, [preview?.path, preview?.text, preview?.loading]);
  const { diff, html } = presentation;
  useLayoutEffect(() => {
    body.current?.focus({ preventScroll: true });
  }, [preview?.repository, preview?.path, preview?.staged]);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setNarrow(node.clientWidth < narrowWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, [!!preview]);
  if (!preview || !diff) return null;
  const update = (change: Partial<typeof preferences>): void => {
    const next = { ...preferences, ...change };
    setPreferences(next);
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      // Preferences still apply for this session.
    }
  };
  const view: View = narrow ? 'unified' : preferences.view;
  const slash = preview.path.lastIndexOf('/');
  const digits = String(
    Math.max(0, ...diff.hunks.flatMap(hunk => hunk.lines.map(line => line.new ?? line.old ?? 0))),
  ).length;
  const emptyMessage = diff.binary
    ? 'Binary file not shown.'
    : diff.status === 'added'
      ? 'Empty file added.'
      : diff.status === 'deleted'
        ? 'Empty file deleted.'
        : diff.status === 'renamed'
          ? 'File renamed without changes.'
          : 'No text changes (file mode or whitespace only).';
  return (
    <section
      class="scratch-tab-git-diff"
      aria-label="Git diff"
      aria-busy={preview.loading || undefined}
      ref={root}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') git.closeDiff();
      }}
    >
      <header class="scratch-tab-diff-header">
        <DiffStat diff={diff} />
        <span class="scratch-tab-diff-path" title={preview.path}>
          {slash > 0 && <span>{preview.path.slice(0, slash + 1)}</span>}
          <strong>{preview.path.slice(slash + 1)}</strong>
        </span>
        {diff.status !== 'modified' && (
          <span class="scratch-tab-diff-label" data-status={diff.status}>
            {diff.status === 'renamed' && diff.renamedFrom
              ? `Renamed from ${diff.renamedFrom}`
              : diff.status === 'added'
                ? 'New file'
                : 'Deleted'}
          </span>
        )}
        <span class="scratch-tab-diff-label">{preview.staged ? 'Staged' : 'Working tree'}</span>
        <span class="scratch-tab-diff-actions">
          <span class="scratch-tab-diff-segmented" role="group" aria-label="Diff view">
            {(['unified', 'split'] as const).map(option => (
              <Button
                key={option}
                aria-pressed={view === option}
                disabled={option === 'split' && narrow}
                title={
                  option === 'split' && narrow ? 'Widen the window to use split view' : undefined
                }
                onClick={() => update({ view: option })}
              >
                {option === 'unified' ? 'Unified' : 'Split'}
              </Button>
            ))}
          </span>
          <Button
            aria-pressed={view === 'split' || preferences.wrap}
            disabled={view === 'split'}
            title="Wrap long lines"
            onClick={() => update({ wrap: !preferences.wrap })}
          >
            Wrap
          </Button>
          <Button
            class="scratch-tab-diff-stage"
            disabled={git.busy || preview.loading}
            onClick={git.stagePreview}
          >
            {preview.staged ? 'Unstage file' : 'Stage file'}
          </Button>
          <Button
            class="scratch-tab-diff-close"
            aria-label="Close diff"
            title="Close diff (Esc)"
            onClick={git.closeDiff}
          >
            <GitIcon name="close" />
          </Button>
        </span>
      </header>
      <div class="scratch-tab-diff-body" ref={body} tabIndex={0} aria-label="Diff lines">
        {preview.loading ? (
          <p class="scratch-tab-diff-empty" role="status">
            Loading diff…
          </p>
        ) : diff.hunks.length ? (
          <table
            class="scratch-tab-diff-table"
            data-view={view}
            data-wrap={view === 'split' || preferences.wrap || undefined}
            style={{ '--diff-digits': digits }}
          >
            {view === 'split' && (
              <colgroup>
                <col class="scratch-tab-diff-number-column" />
                <col />
                <col class="scratch-tab-diff-number-column" />
                <col />
              </colgroup>
            )}
            {diff.hunks.map(hunk => (
              <tbody key={hunk.header + (hunk.lines[0]?.old ?? hunk.lines[0]?.new)}>
                <tr class="scratch-tab-diff-hunk">
                  <td colSpan={view === 'split' ? 4 : 3}>{hunk.header}</td>
                </tr>
                {view === 'unified'
                  ? hunk.lines.map((line, index) => (
                      <tr key={index}>
                        <LineNumber line={line} value={line.old} />
                        <LineNumber line={line} value={line.new} />
                        <Code line={line} html={html} />
                      </tr>
                    ))
                  : splitRows(hunk.lines).map(({ left, right }, index) => (
                      <tr key={index}>
                        <LineNumber line={left} value={left?.old} />
                        <Code line={left} html={html} />
                        <LineNumber line={right} value={right?.new} />
                        <Code line={right} html={html} />
                      </tr>
                    ))}
              </tbody>
            ))}
          </table>
        ) : (
          <p class="scratch-tab-diff-empty">{emptyMessage}</p>
        )}
      </div>
    </section>
  );
}
