import { useLayoutEffect, useReducer } from 'preact/hooks';
import { UPDATE_CHECK_INTERVAL_MS } from '../config/constants/updates.js';
import type { UpdateState } from '../state/updates.js';
import type { UpdateSession } from '../port/updates/inbound/session.js';
import type { UpdateSnapshot } from '../model/updates/application/state.js';

export interface UpdatesBinding {
  state: UpdateState;
  session: UpdateSession;
  signal: AbortSignal;
}

interface UpdatesView {
  state: Readonly<UpdateSnapshot>;
  check(): void;
  install(): void;
}

export function useUpdates({ state, session, signal }: UpdatesBinding): UpdatesView {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useLayoutEffect(() => {
    const unsubscribe = state.subscribe(() => {
      if (!signal.aborted) refresh(0);
    });
    void session.checkRelease();
    const interval = setInterval(() => void session.checkRelease(), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [state, session, signal]);
  return {
    state: state.snapshot,
    check: () => void session.checkRelease(),
    install: () => void session.install(),
  };
}
