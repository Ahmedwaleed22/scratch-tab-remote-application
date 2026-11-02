import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  GitAction,
  GitApi,
  GitChange,
  GitCommit,
  GitResult,
} from '../model/git/application/git.js';

export interface GitRepository {
  path: string;
  status: GitResult | null;
  error: string;
  message: string;
  collapsed: boolean;
}

interface DiffCacheEntry {
  repository: string;
  expires: number;
  value?: string;
  promise: Promise<string>;
}

export interface GitController {
  open: boolean;
  busy: boolean;
  /** Open repositories; closed ones stay hidden until reopened. */
  repositories: GitRepository[];
  closed: number;
  graph: { repository: string; commits: GitCommit[] };
  error: string;
  notice: string;
  preview: {
    repository: string;
    path: string;
    staged: boolean;
    text: string;
    loading?: boolean;
  } | null;
  toggle(): void;
  refresh(): void;
  setMessage(repository: string, message: string): void;
  collapse(repository: string): void;
  run(repository: string, action: GitAction, change?: GitChange, all?: boolean): void;
  commit(repository: string, push?: boolean): void;
  diff(repository: string, change: GitChange, staged: boolean): void;
  prefetchDiff(repository: string, change: GitChange, staged: boolean): void;
  /** Stages or unstages the previewed file, then shows its diff on the other side. */
  stagePreview(): void;
  showGraph(repository: string): void;
  close(repositories: string[]): void;
  reopen(): void;
  closeDiff(): void;
}

export const stagedChanges = (status: GitResult | null): GitChange[] =>
  status?.changes.filter(change => change.index !== ' ' && change.index !== '?') ?? [];
export const workingChanges = (status: GitResult | null): GitChange[] =>
  status?.changes.filter(change => change.worktree !== ' ') ?? [];

export function useGit(
  api: GitApi | undefined,
  activePath: string,
  fileState = '',
): GitController | null {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [graph, setGraph] = useState<GitController['graph']>({ repository: '', commits: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<GitController['preview']>(null);
  const [closed, setClosed] = useState<string[]>([]);
  const alive = useRef(true);
  const locked = useRef(false);
  const refreshing = useRef(false);
  const statusVersions = useRef(new Map<string, number>());
  const graphVersion = useRef(0);
  const diffVersion = useRef(0);
  const prefetching = useRef(0);
  const diffCache = useRef(new Map<string, DiffCacheEntry>());
  const current = useRef(repositories);
  current.current = repositories;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const perform = async (work: () => Promise<void>, background = false): Promise<void> => {
    const lock = background ? refreshing : locked;
    if (!api || lock.current) return;
    lock.current = true;
    if (!background) setBusy(true);
    setError('');
    setNotice(background ? 'Refreshing repositories…' : '');
    try {
      await work();
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : 'Git operation failed.');
    } finally {
      lock.current = false;
      if (alive.current && !background) setBusy(false);
    }
  };
  const update = (path: string, change: Partial<GitRepository>): void =>
    setRepositories(list =>
      list.map(repository =>
        repository.path === path ? { ...repository, ...change } : repository,
      ),
    );
  const invalidateDiffs = (repository?: string): void => {
    for (const [key, entry] of diffCache.current)
      if (!repository || entry.repository === repository) diffCache.current.delete(key);
  };
  const requestDiff = (repository: string, path: string, staged: boolean): DiffCacheEntry => {
    const key = JSON.stringify([repository, path, staged]);
    const cached = diffCache.current.get(key);
    if (cached && cached.expires > Date.now()) return cached;
    const entry: DiffCacheEntry = {
      repository,
      expires: Date.now() + 15000,
      promise: api!
        .execute({ action: 'diff', repository, path, staged })
        .then(response => {
          entry.value = response.diff;
          entry.expires = Date.now() + 15000;
          return response.diff;
        })
        .catch(failure => {
          if (diffCache.current.get(key) === entry) diffCache.current.delete(key);
          throw failure;
        }),
    };
    diffCache.current.delete(key);
    diffCache.current.set(key, entry);
    while (diffCache.current.size > 8) {
      const oldest = diffCache.current.keys().next().value;
      if (oldest !== undefined) diffCache.current.delete(oldest);
    }
    return entry;
  };
  const prefetch = (repository: string, change: GitChange, staged: boolean): void => {
    if (!alive.current || locked.current || prefetching.current >= 2) return;
    const pending = requestDiff(repository, change.path, staged).promise;
    prefetching.current++;
    // Failed speculative reads are evicted; a click retries and reports any error.
    void pending
      .catch(() => undefined)
      .finally(() => {
        prefetching.current--;
      });
  };
  const status = async (path: string): Promise<void> => {
    invalidateDiffs(path);
    const version = (statusVersions.current.get(path) ?? 0) + 1;
    statusVersions.current.set(path, version);
    const latest = (): boolean => alive.current && statusVersions.current.get(path) === version;
    try {
      const next = await api!.execute({ action: 'status', repository: path });
      if (latest()) {
        update(path, { status: next, error: '' });
        if (activePath.startsWith(path + '/')) {
          const changes = [...next.changes].sort(
            (a, b) =>
              Number(path + '/' + b.path === activePath) -
              Number(path + '/' + a.path === activePath),
          );
          for (const change of changes.slice(0, 2)) {
            if (change.worktree !== ' ') prefetch(path, change, false);
            else if (change.index !== ' ' && change.index !== '?') prefetch(path, change, true);
          }
        }
      }
    } catch (failure) {
      if (latest())
        update(path, {
          status: null,
          error: failure instanceof Error ? failure.message : 'Git status failed.',
        });
    }
  };
  const log = async (path: string): Promise<void> => {
    const version = ++graphVersion.current;
    const commits = path ? (await api!.execute({ action: 'log', repository: path })).commits : [];
    if (alive.current && version === graphVersion.current) setGraph({ repository: path, commits });
  };
  const refresh = (discover = true): void => {
    void perform(async () => {
      let priority = '';
      if (discover) {
        try {
          const located = await api!.execute({
            action: 'repository',
            repository: '',
            path: activePath,
          });
          priority = located.repositories.find(path => !closed.includes(path)) ?? '';
        } catch (failure) {
          if (alive.current)
            setError(failure instanceof Error ? failure.message : 'Git repository lookup failed.');
        }
        if (!alive.current) return;
        if (priority && !closed.includes(priority)) {
          const path = priority;
          setRepositories(list =>
            list.some(entry => entry.path === path)
              ? list
              : [{ path, status: null, error: '', message: '', collapsed: false }, ...list],
          );
          try {
            await Promise.all([log(priority), status(priority)]);
          } catch (failure) {
            if (alive.current)
              setError(failure instanceof Error ? failure.message : 'Git graph failed.');
          }
        }
      }
      if (!alive.current) return;
      const selectionVersion = graphVersion.current;
      const discovered = discover
        ? (await api!.execute({ action: 'repositories', repository: '' })).repositories
        : current.current.map(repository => repository.path);
      if (!alive.current) return;
      const found = [...new Set([...(priority ? [priority] : []), ...discovered])];
      setRepositories(list => {
        const previous = new Map(list.map(repository => [repository.path, repository]));
        return found.map(
          path =>
            previous.get(path) ?? {
              path,
              status: null,
              error: '',
              message: '',
              collapsed: false,
            },
        );
      });
      const visible = found.filter(path => !closed.includes(path));
      const selected = visible.includes(graph.repository)
        ? graph.repository
        : ([...visible]
            .sort((a, b) => b.length - a.length)
            .find(path => activePath.startsWith(path + '/')) ??
          visible[0] ??
          '');
      await Promise.all([
        ...(!priority && selectionVersion === graphVersion.current ? [log(selected)] : []),
        ...visible.filter(path => path !== priority).map(status),
      ]);
      if (alive.current)
        setNotice(
          found.length ? 'Repositories refreshed.' : 'No Git repositories found in /workspace.',
        );
    }, true);
  };
  const execute = async (
    repository: string,
    action: GitAction,
    extra: { path?: string; all?: boolean; message?: string } = {},
  ): Promise<string> => {
    ++diffVersion.current;
    invalidateDiffs(repository);
    const response =
      action === 'status' ? null : await api!.execute({ action, repository, ...extra });
    if (!alive.current) return '';
    setPreview(null);
    await Promise.all([
      status(repository),
      ...(graph.repository === repository ? [log(repository)] : []),
    ]);
    return response?.output ?? '';
  };
  const loadDiff = async (repository: string, path: string, staged: boolean): Promise<void> => {
    const version = ++diffVersion.current;
    const entry = requestDiff(repository, path, staged);
    setPreview({
      repository,
      path,
      staged,
      text: entry.value ?? '',
      loading: entry.value === undefined,
    });
    try {
      const text = await entry.promise;
      if (alive.current && version === diffVersion.current)
        setPreview({ repository, path, staged, text });
    } catch (failure) {
      if (alive.current && version === diffVersion.current) {
        setPreview(null);
        setError(failure instanceof Error ? failure.message : 'Git diff failed.');
      }
    }
  };
  useEffect(() => {
    invalidateDiffs();
    if (api && open && /^(Saved|Recreated)/.test(fileState) && preview)
      void loadDiff(preview.repository, preview.path, preview.staged);
  }, [fileState]);
  const done = (action: string, output: string): void => {
    if (alive.current) setNotice(output.trim() || `${action} completed.`);
  };
  if (!api) return null;
  return {
    open,
    busy,
    repositories: repositories.filter(repository => !closed.includes(repository.path)),
    closed: repositories.filter(repository => closed.includes(repository.path)).length,
    graph,
    error,
    notice,
    preview,
    toggle() {
      setOpen(!open);
      if (!open) refresh(!current.current.length);
    },
    refresh() {
      refresh();
    },
    setMessage(repository, message) {
      update(repository, { message });
    },
    collapse(repository) {
      update(repository, {
        collapsed: !current.current.find(entry => entry.path === repository)?.collapsed,
      });
    },
    run(repository, action, change, all) {
      void perform(async () => {
        const output = await execute(repository, action, {
          ...(change ? { path: change.path } : {}),
          ...(all ? { all } : {}),
        });
        done(action[0]!.toUpperCase() + action.slice(1), output);
      });
    },
    commit(repository, push) {
      const entry = current.current.find(item => item.path === repository);
      if (!entry) return;
      const message = entry.message.trim();
      if (!message) {
        setNotice('');
        setError('Enter a commit message.');
        return;
      }
      const all = !stagedChanges(entry.status).length;
      if (
        all &&
        !confirm(
          'There are no staged changes to commit. Stage all changes and commit them directly?',
        )
      )
        return;
      void perform(async () => {
        let output = await execute(repository, 'commit', { message: entry.message, all });
        if (alive.current) update(repository, { message: '' });
        if (push) output = await execute(repository, 'push');
        done('Commit', output);
      });
    },
    diff(repository, change, staged) {
      if (locked.current) return;
      setError('');
      setNotice('');
      void loadDiff(repository, change.path, staged);
    },
    prefetchDiff: prefetch,
    stagePreview() {
      if (!preview || preview.loading) return;
      const { repository, path, staged } = preview;
      void perform(async () => {
        await execute(repository, staged ? 'unstage' : 'stage', { path });
        await loadDiff(repository, path, !staged);
      });
    },
    showGraph(repository) {
      void perform(() => log(repository));
    },
    close(paths) {
      const next = [...new Set([...closed, ...paths])];
      setClosed(next);
      if (preview && next.includes(preview.repository)) {
        ++diffVersion.current;
        setPreview(null);
      }
      if (next.includes(graph.repository)) {
        const fallback = repositories.find(repository => !next.includes(repository.path));
        void perform(() => log(fallback?.path ?? ''));
      }
    },
    reopen() {
      setClosed([]);
    },
    closeDiff() {
      ++diffVersion.current;
      setPreview(null);
    },
  };
}
