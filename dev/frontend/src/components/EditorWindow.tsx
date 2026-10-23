import type { JSX, RefObject } from 'preact';
import EditorFindBar, { EditorFindHighlights } from './EditorFindBar.js';
import IndentationControl from './IndentationControl.js';
import type { EditorTools } from '../hooks/useEditorTools.js';
import Button from './Button.js';
import FileTabs from './FileTabs.js';
import SyntaxSurface from './SyntaxSurface.js';
import MarkdownPreview from './MarkdownPreview.js';
import FileSidebar from './FileSidebar.js';
import type { FileSidebarController } from '../hooks/useFileSidebar.js';
import type { FileTarget } from '../types.js';
import type { EditorWindowState } from '../model/editor/application/window.js';
import type { SyntaxLanguage } from '../model/editor/application/syntax.js';

export interface EditorElements {
  panel: RefObject<HTMLElement>;
  header: RefObject<HTMLElement>;
  textarea: RefObject<HTMLTextAreaElement>;
  preview: RefObject<HTMLElement>;
  download: RefObject<HTMLAnchorElement>;
  retry: RefObject<HTMLButtonElement>;
  tabs: RefObject<HTMLDivElement>;
}
export interface EditorWindowProps {
  target: FileTarget;
  tools: EditorTools;
  text: string;
  onEditorKeyDown(event: KeyboardEvent): void;
  actions: {
    onClose(): void;
    onSave(): void;
    onOpenIde?(): void;
    onEdit(text: string): void;
    onSeparate?(): void;
    onCloseFile(): void;
    onRetry(): void;
  };
  sidebar: FileSidebarController | null;
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
  tools,
  text,
  onEditorKeyDown,
  actions,
  language,
  markdown,
  previewHtml,
  onRaise,
  state,
  elements,
  onToggle,
  sidebar,
}: EditorWindowProps): JSX.Element {
  const { onClose, onSave, onOpenIde, onEdit, onSeparate, onCloseFile, onRetry } = actions;
  const settled = state.unsupported || state.notFound;
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
      style={{ '--scratch-tab-size': tools.indentation.size }}
      onKeyDownCapture={event => {
        if (!(event.target instanceof Element && event.target.closest('.scratch-tab-indent-menu')))
          onEditorKeyDown(event);
      }}
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
          hidden={settled}
          style={settled ? { display: 'none' } : undefined}
        >
          <Button
            disabled={!state.canSave}
            onClick={onSave}
            title={state.missing ? `Recreate ${target.path} with this text` : undefined}
          >
            {state.missing ? 'Recreate' : 'Save'}
          </Button>
          <Button
            onClick={tools.openFind}
            disabled={!state.editable}
            aria-label="Find in file"
            title="Find in file (Ctrl/Cmd+F)"
          >
            Find
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
          {onOpenIde && <Button onClick={onOpenIde}>Open with default editor</Button>}
        </div>
      </header>
      <FileTabs
        entries={state.tabs}
        activePath={state.activePath}
        tabsRef={elements.tabs}
        onSeparate={onSeparate}
        sidebarOpen={sidebar?.visible}
        onToggleSidebar={sidebar?.toggle}
      />
      <div class="scratch-tab-body">
        {sidebar && <FileSidebar {...sidebar.props} />}
        <div class="scratch-tab-main">
          {!settled && <EditorFindBar tools={tools} />}
          {state.missing && (
            <div class="scratch-tab-missing" role="alert">
              <span>
                This file was deleted or moved. Your text is still here; Recreate writes it back to{' '}
                <code>{target.path}</code>.
              </span>
            </div>
          )}
          {state.notFound ? (
            <div class="scratch-tab-unsupported">
              <div role="status">
                <h2>File not found</h2>
                <p>
                  <code>{target.path}</code> no longer exists. It may have been deleted, moved or
                  renamed. Pick another file from Files, or try again.
                </p>
              </div>
              <div class="scratch-tab-not-found-actions">
                <Button ref={elements.retry} onClick={onRetry}>
                  Try again
                </Button>
                <Button onClick={onCloseFile}>Close tab</Button>
              </div>
            </div>
          ) : state.unsupported ? (
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
              <div class="scratch-tab-source" hidden={state.preview}>
                <EditorFindHighlights tools={tools} text={text} />
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
              </div>
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
        </div>
      </div>
      <footer hidden={settled} class={state.failed ? 'scratch-tab-error' : ''}>
        <IndentationControl tools={tools} disabled={!state.editable} />
        <span role="status">{state.status}</span>
      </footer>
    </section>
  );
}
