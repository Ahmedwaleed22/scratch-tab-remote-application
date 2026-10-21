import type { JSX, RefObject } from 'preact';
import Button from './Button.js';
import FileTabs from './FileTabs.js';
import SyntaxSurface from './SyntaxSurface.js';
import MarkdownPreview from './MarkdownPreview.js';
import type { FileTarget } from '../types.js';
import type { EditorWindowState } from '../model/editor/application/window.js';
import type { SyntaxLanguage } from '../model/editor/application/syntax.js';

export interface EditorElements {
  panel: RefObject<HTMLElement>;
  header: RefObject<HTMLElement>;
  textarea: RefObject<HTMLTextAreaElement>;
  preview: RefObject<HTMLElement>;
  download: RefObject<HTMLAnchorElement>;
  tabs: RefObject<HTMLDivElement>;
}
export interface EditorWindowProps {
  target: FileTarget;
  actions: {
    onClose(): void;
    onSave(): void;
    onOpenIde(): void;
    onEdit(text: string): void;
    onSeparate?(): void;
  };
  language: SyntaxLanguage | null;
  markdown: boolean;
  previewHtml: string;
  onRaise(): void;
  state: EditorWindowState;
  elements: EditorElements;
  onToggle(): void;
}

export default function EditorWindow({
  target,
  actions,
  language,
  markdown,
  previewHtml,
  onRaise,
  state,
  elements,
  onToggle,
}: EditorWindowProps): JSX.Element {
  const { onClose, onSave, onOpenIde, onEdit, onSeparate } = actions;
  const input = (
    <textarea
      ref={elements.textarea}
      readOnly={!state.editable}
      spellcheck={false}
      aria-label={`${target.name} file content`}
      hidden={!language && state.preview}
      onInput={event => onEdit(event.currentTarget.value)}
    />
  );
  return (
    <section
      class="scratch-tab-window"
      role="dialog"
      aria-label={target.name}
      ref={elements.panel}
      onPointerDown={onRaise}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          onSave();
        }
      }}
    >
      <header
        class="scratch-tab-header"
        tabIndex={0}
        role="group"
        ref={elements.header}
        aria-label="File window title bar. Use arrow keys to reposition."
      >
        <div class="scratch-tab-controls">
          <Button aria-label="Close window" title="Close window" onClick={onClose} />
        </div>
        <strong title={target.path}>{`${state.dirty ? '● ' : ''}${target.name}`}</strong>
        <div
          class="scratch-tab-actions"
          hidden={state.unsupported}
          style={state.unsupported ? { display: 'none' } : undefined}
        >
          <Button disabled={!state.canSave} onClick={onSave}>
            Save
          </Button>
          {markdown && !state.unsupported && (
            <Button
              disabled={!state.editable}
              onClick={onToggle}
              aria-label={state.preview ? 'Show Markdown source' : 'Show Markdown preview'}
              aria-pressed={state.preview}
              title={
                state.preview
                  ? 'Show unformatted Markdown source'
                  : 'Show formatted Markdown preview'
              }
            >
              {state.preview ? 'Source' : 'Preview'}
            </Button>
          )}
          <Button onClick={onOpenIde}>Open with default editor</Button>
        </div>
      </header>
      <FileTabs
        entries={state.tabs}
        activePath={state.activePath}
        tabsRef={elements.tabs}
        onSeparate={onSeparate}
      />
      {state.unsupported ? (
        <div class="scratch-tab-unsupported">
          <div role="status">
            <h2>File not supported</h2>
            <p>
              Scratch Tab can only edit small UTF-8 text files. Download this file to open it in
              another app.
            </p>
          </div>
          <a href={target.download} download={target.name} ref={elements.download}>
            Download file
          </a>
        </div>
      ) : (
        <>
          {language ? (
            <SyntaxSurface
              language={language}
              textarea={elements.textarea}
              revision={state.revision}
              hidden={state.preview}
            >
              {input}
            </SyntaxSurface>
          ) : (
            input
          )}
          {markdown && (
            <MarkdownPreview
              name={target.name}
              html={previewHtml}
              visible={state.preview}
              previewRef={elements.preview}
            />
          )}
        </>
      )}
      <footer hidden={state.unsupported} class={state.failed ? 'scratch-tab-error' : ''}>
        <span role="status">{state.status}</span>
      </footer>
    </section>
  );
}
