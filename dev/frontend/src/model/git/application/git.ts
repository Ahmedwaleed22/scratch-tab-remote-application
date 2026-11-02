export type GitAction =
  | 'repository'
  | 'repositories'
  | 'status'
  | 'log'
  | 'diff'
  | 'stage'
  | 'unstage'
  | 'commit'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'sync'
  | 'publish';
export interface GitRequest {
  action: GitAction;
  repository: string;
  path?: string;
  staged?: boolean;
  all?: boolean;
  message?: string;
}
export interface GitChange {
  path: string;
  original?: string;
  index: string;
  worktree: string;
}
export interface GitCommit {
  hash: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
  /** Full ref names such as `refs/heads/main`, `refs/remotes/origin/main`, `tag: refs/tags/v1`. */
  refs: string[];
}
export interface GitResult {
  repositories: string[];
  branch: string;
  upstream: string;
  detached: boolean;
  ahead: number;
  behind: number;
  remote: string;
  changes: GitChange[];
  commits: GitCommit[];
  diff: string;
  output: string;
}
export interface GitApi {
  execute(request: GitRequest): Promise<GitResult>;
}
