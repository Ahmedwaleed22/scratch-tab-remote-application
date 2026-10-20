import { useLayoutEffect, useReducer } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { EditorSession } from '../port/editor/inbound/session.js';

export interface EditorBinding {
  session: EditorSession;
  signal: AbortSignal;
  previous: Element | null;
  dispose(): void;
  onClosed(): void;
  onStateChange?(): void;
}

export function useEditor(
  binding: EditorBinding,
  textarea: RefObject<HTMLTextAreaElement>,
  focus: () => void,
) {
  const { session, signal } = binding;
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useLayoutEffect(() => {
    const unsubscribe = session.subscribe(change => {
      if (signal.aborted) return;
      if (change === 'text' && textarea.current) textarea.current.value = session.text;
      refresh(0);
      if (change === 'state') binding.onStateChange?.();
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (session.snapshot.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload, { signal });
    if (session.supportsFile) focus();
    session.start();
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [session, signal]);
  return {
    state: session.snapshot,
    edit: (text: string) => session.edit(text),
    save: () => void session.save(),
    close(force = false, confirmed = false) {
      if (!session.close(force, confirmed)) return;
      binding.dispose();
      binding.onClosed();
      if (binding.previous instanceof HTMLElement) binding.previous.focus();
    },
  };
}
