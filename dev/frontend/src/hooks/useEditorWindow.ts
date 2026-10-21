import { createRef } from 'preact';
import type { Ref } from 'preact';
import { useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import { useEditor } from './useEditor.js';
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
  onClose?(): void;
  onActivate?(): void;
  onSeparate?(): void;
}

export function useEditorWindow(binding: EditorWindowBinding): EditorWindowProps {
  const elements = useMemo<EditorElements>(
    () => ({
      panel: createRef(),
      header: createRef(),
      textarea: createRef(),
      preview: createRef(),
      download: createRef(),
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
    const target = binding.session.snapshot.unsupported
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
      onOpenIde: () => binding.launchIde(binding.target),
      onSeparate: binding.onSeparate,
    },
  };
}
