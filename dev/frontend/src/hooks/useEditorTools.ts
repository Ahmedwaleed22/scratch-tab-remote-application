import type { RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  convertIndentation,
  detectIndentation,
  indentationEdit,
  indentationPreference,
} from '../services/indentation.js';
import type { Indentation, TextEdit } from '../services/indentation.js';

export interface FindMatch {
  start: number;
  end: number;
}
export function findMatches(text: string, query: string): FindMatch[] {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...text.matchAll(new RegExp(escaped, 'giu'))].map(match => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function useEditorTools(
  input: RefObject<HTMLTextAreaElement>,
  text: string,
  revision: number,
  editable: boolean,
  showSource: () => void,
) {
  const [indentation, setIndentation] = useState(indentationPreference);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [index, setIndex] = useState(0);
  const [focusVersion, setFocusVersion] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const highlights = useRef<HTMLPreElement>(null);
  const matches = findOpen ? findMatches(text, query) : [];
  const currentIndex = matches.length ? index % matches.length : 0;
  const current = matches[currentIndex];
  useLayoutEffect(() => {
    if (editable) setIndentation(detectIndentation(text, indentationPreference()));
  }, [revision, editable]);
  useLayoutEffect(() => {
    if (findOpen) {
      findInput.current?.focus();
      findInput.current?.select();
    }
  }, [findOpen, focusVersion]);
  useLayoutEffect(() => {
    const textarea = input.current;
    const layer = highlights.current;
    if (!textarea || !layer) return;
    const synchronize = () => {
      layer.style.width = `${textarea.clientWidth}px`;
      layer.style.height = `${textarea.clientHeight}px`;
      layer.scrollTop = textarea.scrollTop;
      layer.scrollLeft = textarea.scrollLeft;
    };
    const observer = new ResizeObserver(synchronize);
    observer.observe(textarea);
    textarea.addEventListener('scroll', synchronize);
    synchronize();
    return () => {
      observer.disconnect();
      textarea.removeEventListener('scroll', synchronize);
    };
  }, [findOpen, editable, revision, Boolean(query)]);
  useLayoutEffect(() => {
    if (!current || !input.current || document.activeElement === input.current) return;
    const textarea = input.current;
    textarea.setSelectionRange(current.start, current.end);
    const marker = highlights.current?.querySelector<HTMLElement>('[data-current]');
    if (marker) {
      textarea.scrollTop = Math.max(0, marker.offsetTop - textarea.clientHeight / 2);
      textarea.dispatchEvent(new Event('scroll'));
    }
  }, [current?.start, current?.end, query]);
  function apply(edit: TextEdit) {
    const textarea = input.current;
    if (!textarea || textarea.readOnly) return;
    if (textarea.closest('[hidden]')) {
      showSource();
      requestAnimationFrame(() => apply(edit));
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(edit.start, edit.end);
    // insertText keeps the browser's native undo stack; setRangeText supports engines without it.
    if (!document.execCommand('insertText', false, edit.text)) {
      textarea.setRangeText(edit.text, edit.start, edit.end, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  }
  function configure(next: Indentation) {
    setIndentation(next);
    indentationPreference(next);
  }
  function closeFind() {
    setFindOpen(false);
    input.current?.focus();
  }
  function openFind() {
    if (!editable) return;
    const textarea = input.current;
    const selection = textarea?.value.slice(textarea.selectionStart, textarea.selectionEnd);
    showSource();
    if (!findOpen && selection && !selection.includes('\n')) {
      setQueryState(selection);
      setIndex(0);
    }
    setFindOpen(true);
    setFocusVersion(value => value + 1);
  }
  return {
    indentation,
    configure,
    focusEditor() {
      showSource();
      requestAnimationFrame(() => input.current?.focus());
    },
    findInput,
    highlights,
    findOpen,
    query,
    matches,
    currentIndex,
    setQuery(value: string) {
      setQueryState(value);
      setIndex(0);
    },
    step(direction: number) {
      if (matches.length) setIndex((currentIndex + direction + matches.length) % matches.length);
    },
    openFind,
    closeFind,
    keyDown(event: KeyboardEvent) {
      if (event.isComposing || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        event.stopPropagation();
        openFind();
        return;
      }
      if (event.key === 'Escape' && findOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeFind();
        return;
      }
      if (event.target !== input.current || !editable || event.ctrlKey || event.metaKey) return;
      const textarea = input.current!;
      const edit = indentationEdit(
        textarea.value,
        textarea.selectionStart,
        textarea.selectionEnd,
        event.key,
        event.shiftKey,
        indentation,
      );
      if (edit) {
        event.preventDefault();
        event.stopPropagation();
        apply(edit);
      }
    },
    command(action: string) {
      if (action === 'detect') {
        configure(detectIndentation(text, indentation));
        return;
      }
      if (action === 'spaces' || action === 'tabs') {
        configure({ ...indentation, spaces: action === 'spaces' });
        return;
      }
      const next =
        action === 'convert-spaces'
          ? { ...indentation, spaces: true }
          : action === 'convert-tabs'
            ? { ...indentation, spaces: false }
            : indentation;
      const replacement =
        action === 'trim' ? text.replace(/[\t ]+$/gm, '') : convertIndentation(text, next);
      if (replacement !== text)
        apply({
          start: 0,
          end: text.length,
          text: replacement,
          selectionStart: 0,
          selectionEnd: 0,
        });
      configure(next);
    },
  };
}
export type EditorTools = ReturnType<typeof useEditorTools>;
