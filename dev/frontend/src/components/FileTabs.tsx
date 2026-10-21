import type { JSX, RefObject } from 'preact';
import type { Tab } from '../types.js';
import Button from './Button.js';
import FileIcon from './FileIcon.js';

interface Props {
  entries: Tab[];
  activePath: string | null;
  tabsRef: RefObject<HTMLDivElement>;
  onSeparate?(): void;
  sidebarOpen?: boolean;
  onToggleSidebar?(): void;
}
export default function FileTabs({
  entries,
  activePath,
  tabsRef,
  onSeparate,
  sidebarOpen,
  onToggleSidebar,
}: Props): JSX.Element {
  return (
    <div class="scratch-tab-tabbar" hidden={!entries.length}>
      {onToggleSidebar && (
        <Button
          class="scratch-tab-sidebar-toggle"
          aria-label={sidebarOpen ? 'Hide files' : 'Show files'}
          title={sidebarOpen ? 'Hide files' : 'Show files'}
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="12"
              height="10"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
            />
            <path d="M6 3v10" stroke="currentColor" stroke-width="1.4" />
          </svg>
        </Button>
      )}
      <div class="scratch-tab-tabs" role="tablist" aria-label="Open files" ref={tabsRef}>
        {entries.map((entry, index) => (
          <div
            class="scratch-tab-tab"
            role="presentation"
            key={entry.path}
            data-selected={entry.path === activePath || undefined}
          >
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
              <FileIcon name={entry.name} />
              <span class="scratch-tab-tab-name">{`${entry.dirty ? '● ' : ''}${entry.name}`}</span>
            </Button>
            <Button
              class="scratch-tab-tab-close"
              data-path={entry.path}
              aria-label={`Close tab ${entry.name}`}
              title={`Close tab ${entry.name}`}
              onClick={entry.close}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.2" />
              </svg>
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
