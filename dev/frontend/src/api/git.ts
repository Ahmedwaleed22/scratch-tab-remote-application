import type { Remote } from '../types.js';
import type { GitApi, GitResult, GitChange, GitCommit } from '../model/git/application/git.js';
import { isJsonObject } from '../shared/json.js';

export function createGit(backend: Remote['backend'], projectId: string): GitApi {
  return {
    async execute(request): Promise<GitResult> {
      const response = await backend.call<unknown>('file', {
        projectId,
        method: 'POST',
        body: { git: request },
      });
      if (!isJsonObject(response) || !isJsonObject(response.git))
        throw new Error(
          'Unexpected Git response. Reinstall Scratch Tab to update its container command.',
        );
      const value = response.git;
      const repositories = value.repositories ?? [];
      const changes = value.changes;
      if (
        !Array.isArray(repositories) ||
        !repositories.every(path => typeof path === 'string') ||
        !Array.isArray(changes)
      )
        throw new Error('Unexpected Git response.');
      const parsed: GitChange[] = changes.map(change => {
        if (
          !isJsonObject(change) ||
          typeof change.path !== 'string' ||
          typeof change.index !== 'string' ||
          typeof change.worktree !== 'string' ||
          (change.original !== undefined && typeof change.original !== 'string')
        )
          throw new Error('Unexpected Git change.');
        return {
          path: change.path,
          index: change.index,
          worktree: change.worktree,
          ...(typeof change.original === 'string' ? { original: change.original } : {}),
        };
      });
      const string = (key: string): string => {
        if (value[key] === undefined) return '';
        if (typeof value[key] !== 'string') throw new Error('Unexpected Git response.');
        return value[key];
      };
      const count = (key: string): number => {
        if (value[key] === undefined) return 0;
        if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0)
          throw new Error('Unexpected Git response.');
        return value[key] as number;
      };
      const history = value.commits ?? [];
      if (!Array.isArray(history)) throw new Error('Unexpected Git response.');
      const commits: GitCommit[] = history.map(commit => {
        const strings = (list: unknown): list is string[] =>
          Array.isArray(list) && list.every(item => typeof item === 'string');
        if (
          !isJsonObject(commit) ||
          !['hash', 'subject', 'author', 'date'].every(key => typeof commit[key] === 'string') ||
          !strings(commit.parents) ||
          (commit.refs !== undefined && !strings(commit.refs))
        )
          throw new Error('Unexpected Git commit.');
        return {
          hash: commit.hash as string,
          parents: commit.parents,
          subject: commit.subject as string,
          author: commit.author as string,
          date: commit.date as string,
          refs: (commit.refs as string[] | undefined) ?? [],
        };
      });
      if (value.detached !== undefined && typeof value.detached !== 'boolean')
        throw new Error('Unexpected Git response.');
      return {
        repositories,
        changes: parsed,
        commits,
        branch: string('branch'),
        upstream: string('upstream'),
        detached: value.detached === true,
        ahead: count('ahead'),
        behind: count('behind'),
        remote: string('remote'),
        diff: string('diff'),
        output: string('output'),
      };
    },
  };
}
