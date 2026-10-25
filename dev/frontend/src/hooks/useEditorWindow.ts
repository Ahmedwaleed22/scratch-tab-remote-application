import type { DirectoryEntry } from '../model/files/application/directory.js';
import { createRef } from 'preact';
import type { Ref } from 'preact';
import { useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import { useEditorTools } from './useEditorTools.js';
import { useEditor } from './useEditor.js';
import { useFileSidebar } from './useFileSidebar.js';
import type { FileTree } from '../port/files/inbound/tree.js';
import type { EditorBinding } from './useEditor.js';
import type { EditorElements, EditorWindowProps } from '../components/EditorWindow.js';
import type { EditorWindowView } from '../port/editor/outbound/view.js';
import type { FileTarget, Tab } from '../types.js';
import type { WindowGeometryPersistence } from '../port/editor/outbound/layout.js';
import type { WindowLayoutBinding } from '../presenters/windowLayout.js';
import { restoreWindowLayout, bindWindowLayout } from '../presenters/windowLayout.js';
import { languageFor } from '../presenters/syntax.js';
import { markdownPreview } from '../presenters/markdown.js';
import { markdownPreference } from '../services/markdownPreference.js';
import { MARKDOWN_EXTENSION } from '../config/syntax.js';

export interface EditorWindowBinding extends EditorBinding {
  target: FileTarget;
  index: number;
  layoutPersistence: WindowGeometryPersistence;
  controllerRef: Ref<EditorWindowView>;
  nextLayer(): number;
  launchIde(target: FileTarget): void;
  canLaunchIde?(target: FileTarget): boolean;
  onClose?(): void;
  onActivate?(): void;
  onSeparate?(): void;
  /** Windows mounted outside a chat session have no sidebar. */
  fileTree?: FileTree;
  onOpenFile?(entry: DirectoryEntry): void;
}

export function useEditorWindow(binding: EditorWindowBinding): EditorWindowProps {
  const elements = useMemo<EditorElements>(
    () => ({
      panel: createRef(),
      header: createRef(),
      textarea: createRef(),
      preview: createRef(),
      download: createRef(),
      retry: createRef(),
      tabs: createRef(),
    }),
    [],
  );
  const windowState = useRef<{ preview: boolean; tabs: Tab[]; activePath: string | null }>({
    preview: MARKDOWN_EXTENSION.test(binding.target.name) && markdownPreference.read(),
    tabs: [],
    activePath: null,
  });
  const layout = useRef<WindowLayoutBinding | undefined>(undefined);
  const focusPreview = useRef(false);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const focus = () => {
    if (elements.panel.current?.style.display === 'none') return;
    const { unsupported, notFound } = binding.session.snapshot;
    const target = notFound
      ? elements.retry.current
      : unsupported
        ? elements.download.current
        : windowState.current.preview
          ? elements.preview.current
          : layout.current?.isCompact
            ? elements.header.current
            : elements.textarea.current;
    target?.focus({ preventScroll: true });
  };
  const raise = () => {
    binding.onActivate?.();
    elements.panel.current!.style.zIndex = String(binding.nextLayer());
  };
  useLayoutEffect(() => {
    const panel = elements.panel.current!;
    restoreWindowLayout(panel, binding.index, binding.layoutPersistence);
    panel.style.zIndex = String(binding.nextLayer());
    layout.current = bindWindowLayout({
      panel,
      header: elements.header.current!,
      signal: binding.signal,
      persistence: binding.layoutPersistence,
    });
    return () => layout.current!.dispose();
  }, [binding]);
  const editor = useEditor(binding, elements.textarea, focus);
  useLayoutEffect(() => {
    if (editor.state.unsupported) focus();
  }, [editor.state.unsupported]);
  useLayoutEffect(() => {
    // Retrying remounts the textarea, which needs the text a finished read already delivered.
    if (!editor.state.notFound && elements.textarea.current && editor.state.editable)
      elements.textarea.current.value = binding.session.text;
    if (editor.state.notFound) focus();
  }, [editor.state.notFound]);
  const tools = useEditorTools(
    elements.textarea,
    binding.session.text,
    editor.state.revision,
    editor.state.editable,
    () => {
      if (windowState.current.preview) {
        windowState.current.preview = false;
        refresh(0);
      }
    },
  );
  const sidebar = useFileSidebar(binding.fileTree, binding.target.path, binding.onOpenFile);
  useLayoutEffect(() => {
    if (!focusPreview.current) return;
    focusPreview.current = false;
    (windowState.current.preview ? elements.preview.current : elements.textarea.current)?.focus({
      preventScroll: true,
    });
  }, [windowState.current.preview]);
  useImperativeHandle(
    binding.controllerRef,
    () => ({
      close: editor.close,
      restore() {
        raise();
        const tree = binding.fileTree;
        if (tree && (tree.snapshot.open || tree.snapshot.drawerOpen))
          tree.reveal(binding.target.path);
        focus();
      },
      focus,
      setTabs(tabs: Tab[], activePath: string | null) {
        windowState.current.tabs = tabs;
        windowState.current.activePath = activePath;
        refresh(0);
      },
      focusTab() {
        const tab = [
          ...(elements.tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []),
        ].find(node => node.dataset.path === binding.target.path);
        tab?.focus({ preventScroll: true });
        tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      },
      setVisible(visible: boolean) {
        elements.panel.current!.style.display = visible ? '' : 'none';
        if (visible) layout.current!.fitViewport();
      },
      copyGeometry(other) {
        Object.assign(elements.panel.current!.style, other.geometry);
      },
      get geometry() {
        const { left, top, width, height } = elements.panel.current!.style;
        return { left, top, width, height };
      },
      offset() {
        layout.current!.offset();
      },
      refreshLinks() {
        refresh(0);
      },
    }),
    [],
  );
  return {
    target: binding.target,
    tools,
    text: binding.session.text,
    onEditorKeyDown: tools.keyDown,
    elements,
    state: { ...editor.state, ...windowState.current },
    language: languageFor(binding.target.name),
    markdown: MARKDOWN_EXTENSION.test(binding.target.name),
    previewHtml: windowState.current.preview
      ? markdownPreview(elements.textarea.current?.value ?? '', binding.target)
      : '',
    onRaise: raise,
    onToggle() {
      windowState.current.preview = !windowState.current.preview;
      markdownPreference.write(windowState.current.preview);
      focusPreview.current = true;
      refresh(0);
    },
    actions: {
      onClose: binding.onClose ?? (() => editor.close()),
      onSave: editor.save,
      onEdit: editor.edit,
      onOpenIde:
        (binding.canLaunchIde?.(binding.target) ?? true)
          ? () => binding.launchIde(binding.target)
          : undefined,
      onSeparate: binding.onSeparate,
      onCloseFile: () => editor.close(),
      onRetry: () => binding.session.retry(),
    },
    sidebar,
  };
}
