import type { JSX } from 'preact';
import type { EditorTools } from '../hooks/useEditorTools.js';
import Button from './Button.js';
const icon = (path: string) => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
);
export default function EditorFindBar({ tools }: { tools: EditorTools }): JSX.Element | null {
  if (!tools.findOpen) return null;
  return (
    <div class="scratch-tab-find" role="search" aria-label="Find in file">
      {icon('m21 21-4.34-4.34 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0')}
      <input
        ref={tools.findInput}
        value={tools.query}
        onInput={event => tools.setQuery(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            tools.step(event.shiftKey ? -1 : 1);
          }
        }}
        placeholder="Find in file"
        aria-label="Find in file"
        autoComplete="off"
        spellcheck={false}
      />
      <span
        class={tools.query && !tools.matches.length ? 'scratch-tab-find-empty' : ''}
        aria-live="polite"
      >
        {!tools.query
          ? ''
          : !tools.matches.length
            ? 'No results'
            : `${tools.currentIndex + 1} of ${tools.matches.length}`}
      </span>
      <Button
        onClick={() => tools.step(-1)}
        disabled={!tools.matches.length}
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
      >
        {icon('m12 19 0-14 m-7 7 7-7 7 7')}
      </Button>
      <Button
        onClick={() => tools.step(1)}
        disabled={!tools.matches.length}
        aria-label="Next match"
        title="Next match (Enter)"
      >
        {icon('m12 5 0 14 m-7-7 7 7 7-7')}
      </Button>
      <Button onClick={tools.closeFind} aria-label="Close find" title="Close (Esc)">
        {icon('m18 6-12 12 M6 6l12 12')}
      </Button>
    </div>
  );
}
export function EditorFindHighlights({
  tools,
  text,
}: {
  tools: EditorTools;
  text: string;
}): JSX.Element | null {
  if (!tools.findOpen || !tools.query) return null;
  const fragments: JSX.Element[] = [];
  let offset = 0;
  const matches = tools.matches.slice(0, 2000);
  if (tools.currentIndex >= 2000 && tools.matches[tools.currentIndex])
    matches.push(tools.matches[tools.currentIndex]!);
  for (const match of matches) {
    fragments.push(<span key={`text-${offset}`}>{text.slice(offset, match.start)}</span>);
    fragments.push(
      <mark
        key={`match-${match.start}`}
        data-current={tools.matches[tools.currentIndex] === match ? '' : undefined}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );
    offset = match.end;
  }
  fragments.push(<span key="tail">{text.slice(offset) + '\n'}</span>);
  return (
    <pre class="scratch-tab-find-highlights" ref={tools.highlights} aria-hidden="true">
      {fragments}
    </pre>
  );
}
