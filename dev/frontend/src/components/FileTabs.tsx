import type { JSX, RefObject } from 'preact';
import type { Tab } from '../types.js';
import Button from './Button.js';

interface Props {
  entries: Tab[];
  activePath: string | null;
  tabsRef: RefObject<HTMLDivElement>;
  onSeparate?(): void;
}
export default function FileTabs({ entries, activePath, tabsRef, onSeparate }: Props): JSX.Element {
  return (
    <div class="scratch-tab-tabbar" hidden={!entries.length}>
      <div class="scratch-tab-tabs" role="tablist" aria-label="Open files" ref={tabsRef}>
        {entries.map((entry, index) => (
          <div class="scratch-tab-tab" role="presentation" key={entry.path}>
            <Button
              role="tab"
              title={entry.path}
              data-path={entry.path}
              aria-selected={entry.path === activePath}
              tabIndex={entry.path === activePath ? 0 : -1}
              onClick={entry.select}
              onKeyDown={event => {
                const destinations: Partial<Record<string, number>> = {
                  ArrowRight: (index + 1) % entries.length,
                  ArrowLeft: (index + entries.length - 1) % entries.length,
                  Home: 0,
                  End: entries.length - 1,
                };
                const next = destinations[event.key];
                if (next === undefined) return;
                const destination = entries[next];
                if (!destination) return;
                event.preventDefault();
                destination.select();
              }}
            >
              {`${entry.dirty ? '● ' : ''}${entry.name}`}
            </Button>
            <Button
              class="scratch-tab-tab-close"
              data-path={entry.path}
              aria-label={`Close tab ${entry.name}`}
              title={`Close tab ${entry.name}`}
              onClick={entry.close}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button class="scratch-tab-separate" disabled={entries.length < 2} onClick={onSeparate}>
        Separate window
      </Button>
    </div>
  );
}
