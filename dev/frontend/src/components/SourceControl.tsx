import type { ButtonHTMLAttributes, JSX } from 'preact';
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  stagedChanges,
  workingChanges,
  type GitController,
  type GitRepository,
} from '../hooks/useGit.js';
import type { GitAction, GitChange } from '../model/git/application/git.js';
import { layoutGraph, type GraphRow } from '../model/git/application/graph.js';
import Button from './Button.js';
import GitIcon, { type GitIconName } from './GitIcon.js';
import QuickPick from './QuickPick.js';
import Splitter from './Splitter.js';
import type { PanelSize } from '../hooks/usePanelSize.js';

const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘Enter' : 'Ctrl+Enter';
const remoteActions: Record<string, string> = {
  pull: 'Pull remote commits (fast-forward only) into',
  push: 'Push commits to the remote from',
  sync: 'Pull and then push commits for',
  publish: 'Publish the current branch to the remote from',
};

function IconButton({
  icon,
  label,
  ...props
}: { icon: GitIconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <Button class="scratch-tab-git-action" aria-label={label} title={label} {...props}>
      <GitIcon name={icon} />
    </Button>
  );
}

function Menu({
  label,
  icon,
  disabled,
  items,
  class: className,
}: {
  label: string;
  icon: GitIconName;
  disabled: boolean;
  items: [string, () => void][];
  class?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div
      class={`scratch-tab-git-menu ${className ?? ''}`}
      onFocusOut={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <IconButton
        icon={icon}
        label={label}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div role="menu" aria-label={label}>
          {items.map(([name, select]) => (
            <Button
              role="menuitem"
              key={name}
              onClick={() => {
                setOpen(false);
                select();
              }}
            >
              {name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function names(paths: string[]): Map<string, string> {
  const base = (path: string): string => path.slice(path.lastIndexOf('/') + 1) || path;
  return new Map(
    paths.map(path => [
      path,
      paths.some(other => other !== path && base(other) === base(path))
        ? path.replace(/^\/workspace\//, '')
        : base(path),
    ]),
  );
}

interface ContextTarget {
  repository: string;
  x: number;
  y: number;
}

function ContextMenu({
  target,
  items,
  onClose,
}: {
  target: ContextTarget;
  items: [string, () => void, boolean?][];
  onClose(): void;
}): JSX.Element {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current!;
    const bounds = node.offsetParent?.getBoundingClientRect();
    if (bounds) {
      node.style.left = `${Math.max(4, Math.min(target.x, bounds.width - node.offsetWidth - 4))}px`;
      node.style.top = `${Math.max(4, Math.min(target.y, bounds.height - node.offsetHeight - 4))}px`;
    }
    node.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent): void => {
      if (!(event.target instanceof Node && node.contains(event.target))) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [target]);
  return (
    <div
      class="scratch-tab-git-context"
      role="menu"
      aria-label="Repository actions"
      ref={menu}
      onKeyDown={event => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const enabled = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]:not(:disabled)',
            ),
          ];
          const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
          enabled[
            (index + (event.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length
          ]?.focus();
        }
      }}
      onFocusOut={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose();
      }}
    >
      {items.map(([label, select, disabled]) => (
        <Button
          role="menuitem"
          key={label}
          disabled={disabled}
          onClick={() => {
            onClose();
            select();
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function ChangeGroup({
  git,
  repository,
  title,
  entries,
  cached,
}: {
  git: GitController;
  repository: string;
  title: string;
  entries: GitChange[];
  cached: boolean;
}): JSX.Element | null {
  const [collapsed, setCollapsed] = useState(false);
  if (!entries.length) return null;
  return (
    <section class="scratch-tab-git-group" aria-label={title}>
      <div class="scratch-tab-git-group-row">
        <Button
          class="scratch-tab-git-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          <GitIcon name={collapsed ? 'chevron-right' : 'chevron-down'} />
          <span>{title}</span>
        </Button>
        <IconButton
          icon={cached ? 'minus' : 'plus'}
          label={cached ? 'Unstage All Changes' : 'Stage All Changes'}
          disabled={git.busy}
          onClick={() => git.run(repository, cached ? 'unstage' : 'stage', undefined, true)}
        />
        <span class="scratch-tab-git-count">{entries.length}</span>
      </div>
      {!collapsed &&
        entries.map(change => {
          const slash = change.path.lastIndexOf('/');
          const letter = (cached ? change.index : change.worktree).replace('?', 'U');
          const selected =
            git.preview?.repository === repository &&
            git.preview.path === change.path &&
            git.preview.staged === cached;
          return (
            <div
              class="scratch-tab-git-file"
              key={change.path}
              data-selected={selected || undefined}
            >
              <Button
                disabled={git.busy}
                title={change.original ? `${change.original} → ${change.path}` : change.path}
                onPointerEnter={() => git.prefetchDiff(repository, change, cached)}
                onFocus={() => git.prefetchDiff(repository, change, cached)}
                onClick={() => git.diff(repository, change, cached)}
                aria-label={`View ${cached ? 'staged' : 'working'} diff ${change.path}`}
              >
                <GitIcon name="file" />
                <span class="scratch-tab-git-file-name">{change.path.slice(slash + 1)}</span>
                {slash > 0 && (
                  <span class="scratch-tab-git-file-folder">{change.path.slice(0, slash)}</span>
                )}
              </Button>
              <IconButton
                icon={cached ? 'minus' : 'plus'}
                label={`${cached ? 'Unstage' : 'Stage'} ${change.path}`}
                disabled={git.busy}
                onClick={() => git.run(repository, cached ? 'unstage' : 'stage', change)}
              />
              <span class="scratch-tab-git-letter" data-status={letter}>
                {letter}
              </span>
            </div>
          );
        })}
    </section>
  );
}

function Repository({
  git,
  repository,
  name,
  onContextMenu,
}: {
  git: GitController;
  repository: GitRepository;
  name: string;
  onContextMenu(event: MouseEvent): void;
}): JSX.Element {
  const { path, status } = repository;
  const staged = stagedChanges(status);
  const changes = workingChanges(status);
  const unpublished = !!status && !!status.remote && !status.upstream && !status.detached;
  const remote = (action: GitAction): void => {
    if (action === 'fetch' || confirm(`${remoteActions[action]} ${name}?`)) git.run(path, action);
  };
  const branch = status?.branch ?? '…';
  const commitPrimary =
    !status ||
    !!staged.length ||
    !!changes.length ||
    !(unpublished || status.ahead || status.behind);
  const primary: JSX.Element =
    !status || staged.length || changes.length ? (
      <Button
        class="scratch-tab-git-primary"
        disabled={git.busy || !status || !(staged.length || changes.length)}
        onClick={() => git.commit(path)}
      >
        <GitIcon name="check" />
        Commit
      </Button>
    ) : unpublished ? (
      <Button class="scratch-tab-git-primary" disabled={git.busy} onClick={() => remote('publish')}>
        <GitIcon name="publish" />
        Publish Branch
      </Button>
    ) : status.ahead || status.behind ? (
      <Button class="scratch-tab-git-primary" disabled={git.busy} onClick={() => remote('sync')}>
        <GitIcon name="sync" />
        Sync Changes {status.behind ? `${status.behind}↓ ` : ''}
        {status.ahead ? `${status.ahead}↑` : ''}
      </Button>
    ) : (
      <Button class="scratch-tab-git-primary" disabled>
        <GitIcon name="check" />
        Commit
      </Button>
    );
  return (
    <div class="scratch-tab-git-repo" role="group" aria-label={`Repository ${name}`}>
      <div class="scratch-tab-git-repo-row" onContextMenu={onContextMenu}>
        <Button
          class="scratch-tab-git-toggle"
          title={path}
          aria-expanded={!repository.collapsed}
          onClick={() => git.collapse(path)}
        >
          <GitIcon name={repository.collapsed ? 'chevron-right' : 'chevron-down'} />
          <GitIcon name="repo" />
          <span>{name}</span>
        </Button>
        <span
          class="scratch-tab-git-branch"
          title={status?.upstream ? `${branch} → ${status.upstream}` : branch}
        >
          <GitIcon name={status?.detached ? 'target' : 'branch'} />
          <span>{branch}</span>
        </span>
        {unpublished ? (
          <IconButton
            icon="publish"
            label="Publish Branch"
            disabled={git.busy}
            onClick={() => remote('publish')}
          />
        ) : (
          status?.upstream && (
            <IconButton
              icon="sync"
              label={`Synchronize Changes (${status.behind}↓ ${status.ahead}↑)`}
              disabled={git.busy}
              onClick={() => remote('sync')}
            />
          )
        )}
        <IconButton
          icon="check"
          label="Commit"
          disabled={git.busy || !(staged.length || changes.length)}
          onClick={() => git.commit(path)}
        />
        <IconButton
          icon="refresh"
          label="Refresh"
          disabled={git.busy}
          onClick={() => git.run(path, 'status')}
        />
        <Menu
          label="More Actions"
          icon="more"
          disabled={git.busy}
          items={[
            ['Fetch', () => remote('fetch')],
            ['Pull', () => remote('pull')],
            ['Push', () => remote('push')],
            ['Show in Graph', () => git.showGraph(path)],
          ]}
        />
      </div>
      {!repository.collapsed && (
        <div class="scratch-tab-git-repo-body">
          {repository.error && (
            <p class="scratch-tab-error" role="alert">
              {repository.error}
            </p>
          )}
          <textarea
            aria-label={`Commit message for ${name}`}
            value={repository.message}
            disabled={git.busy && !status}
            rows={1}
            placeholder={`Message (${shortcut} to commit on "${branch}")`}
            onInput={event => git.setMessage(path, event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                git.commit(path);
              }
            }}
          />
          <div class="scratch-tab-git-primary-row">
            {primary}
            {commitPrimary && (
              <Menu
                class="scratch-tab-git-primary-menu"
                label="Commit Options"
                icon="chevron-down"
                disabled={git.busy || !(staged.length || changes.length)}
                items={[
                  ['Commit', () => git.commit(path)],
                  ['Commit & Push', () => git.commit(path, true)],
                ]}
              />
            )}
          </div>
          <ChangeGroup
            git={git}
            repository={path}
            title="Staged Changes"
            entries={staged}
            cached={true}
          />
          <ChangeGroup
            git={git}
            repository={path}
            title="Changes"
            entries={changes}
            cached={false}
          />
        </div>
      )}
    </div>
  );
}

const laneColors = ['#4a9cf0', '#e0632c', '#ffb000', '#dc267f', '#40b0a6', '#b66dff', '#994f00'];
const laneWidth = 11;
const rowHeight = 22;
const laneX = (lane: number): number => 7 + lane * laneWidth;
const laneColor = (color: number): string => laneColors[color % laneColors.length]!;

function Lanes({ row, head }: { row: GraphRow; head: boolean }): JSX.Element {
  const middle = rowHeight / 2;
  const x = laneX(row.column);
  const merge = row.commit.parents.length > 1;
  return (
    <svg
      class="scratch-tab-git-lanes"
      width={laneX(row.width - 1) + 7}
      height={rowHeight}
      aria-hidden="true"
    >
      {row.edges.map((edge, index) => {
        const from = laneX(edge.from);
        const to = laneX(edge.to);
        const d =
          edge.kind === 'pass'
            ? `M${from} 0V${rowHeight}`
            : edge.kind === 'top'
              ? from === to
                ? `M${from} 0V${middle}`
                : `M${from} 0Q${from} ${middle} ${to} ${middle}`
              : from === to
                ? `M${from} ${middle}V${rowHeight}`
                : `M${from} ${middle}Q${to} ${middle} ${to} ${rowHeight}`;
        return <path key={index} d={d} stroke={laneColor(edge.color)} />;
      })}
      {head || merge ? (
        <>
          <circle
            cx={x}
            cy={middle}
            r={head ? 5 : 4.5}
            class="scratch-tab-git-node-ring"
            stroke={laneColor(row.color)}
          />
          {merge && !head && <circle cx={x} cy={middle} r={2} fill={laneColor(row.color)} />}
        </>
      ) : (
        <circle cx={x} cy={middle} r={4} fill={laneColor(row.color)} />
      )}
    </svg>
  );
}

function Refs({ refs, color }: { refs: string[]; color: string }): JSX.Element | null {
  const badges = refs.flatMap((ref): [GitIconName, string][] => {
    if (ref.startsWith('refs/heads/')) return [['branch', ref.slice(11)]];
    if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD'))
      return [['cloud', ref.slice(13)]];
    if (ref.startsWith('tag: refs/tags/')) return [['tag', ref.slice(15)]];
    return [];
  });
  if (!badges.length) return null;
  return (
    <span class="scratch-tab-git-refs" style={{ '--ref-color': color }}>
      {badges.map(([icon, label], index) => (
        <span key={label + icon} title={label} data-icon-only={index > 0 || undefined}>
          <GitIcon name={icon} />
          {index === 0 && <span>{label}</span>}
        </span>
      ))}
    </span>
  );
}

function Graph({
  git,
  names,
  id,
  height,
  collapsed,
  setCollapsed,
}: {
  git: GitController;
  names: Map<string, string>;
  id: string;
  height: number | null;
  collapsed: boolean;
  setCollapsed(collapsed: boolean): void;
}): JSX.Element {
  const { repository, commits } = git.graph;
  const status = git.repositories.find(entry => entry.path === repository)?.status;
  const rows = layoutGraph(commits);
  const headRef = status && !status.detached ? `refs/heads/${status.branch}` : '';
  return (
    <section
      id={id}
      class="scratch-tab-git-graph"
      aria-label="Graph"
      data-collapsed={collapsed || undefined}
      style={!collapsed && height !== null ? { height: `${height}px` } : undefined}
    >
      <div class="scratch-tab-git-section">
        <Button
          class="scratch-tab-git-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          <GitIcon name={collapsed ? 'chevron-right' : 'chevron-down'} />
          <span>Graph</span>
        </Button>
        <QuickPick
          class="scratch-tab-git-graph-pick"
          label="Graph repository"
          disabled={git.busy || !names.size}
          trigger={
            <>
              <GitIcon name="repo" />
              <span>{names.get(repository) ?? 'No repository'}</span>
            </>
          }
          placeholder="Select a repository to view its graph"
          listLabel="Repositories"
          empty="No matching repositories"
          selectedValue={repository}
          options={[...names].map(([path, name]) => ({
            value: path,
            label: name,
            detail: [
              git.repositories.find(entry => entry.path === path)?.status?.branch,
              path.replace(/^\/workspace\//, ''),
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
          onChoose={(value, close) => {
            close();
            git.showGraph(value);
          }}
        />
        <IconButton
          icon="refresh"
          label="Refresh Graph"
          disabled={git.busy || !repository}
          onClick={() => git.showGraph(repository)}
        />
      </div>
      {!collapsed && (
        <ol class="scratch-tab-git-commits">
          {rows.map(row => {
            const { commit } = row;
            const head = headRef ? commit.refs.includes(headRef) : commit.refs.includes('HEAD');
            return (
              <li
                key={commit.hash}
                title={`${commit.hash.slice(0, 8)} · ${commit.author} · ${commit.date}\n${commit.subject}`}
                data-head={head || undefined}
              >
                <Lanes row={row} head={head} />
                <span class="scratch-tab-git-subject">
                  <span>{commit.subject}</span>
                  <small>{commit.author}</small>
                </span>
                <Refs refs={commit.refs} color={laneColor(row.color)} />
              </li>
            );
          })}
          {repository && !commits.length && <li class="scratch-tab-git-empty">No commits yet.</li>}
        </ol>
      )}
    </section>
  );
}

export default function SourceControl({
  git,
  graph,
}: {
  git: GitController;
  graph: PanelSize;
}): JSX.Element {
  const [graphCollapsed, setGraphCollapsed] = useState(false);
  const graphId = useId();
  const labels = names(git.repositories.map(repository => repository.path));
  const [collapsed, setCollapsed] = useState(false);
  const [context, setContext] = useState<ContextTarget | null>(null);
  return (
    <aside
      class="scratch-tab-git"
      aria-label="Source Control"
      aria-busy={git.busy}
      hidden={!git.open}
      onKeyDown={event => event.stopPropagation()}
    >
      <div class="scratch-tab-git-title">
        <h2>Source Control</h2>
        <IconButton
          icon="refresh"
          label="Discover repositories and refresh changes"
          disabled={git.busy}
          onClick={git.refresh}
        />
        <IconButton icon="close" label="Close Source Control" onClick={git.toggle} />
      </div>
      <section class="scratch-tab-git-changes" aria-label="Changes">
        <div class="scratch-tab-git-section">
          <Button
            class="scratch-tab-git-toggle"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <GitIcon name={collapsed ? 'chevron-right' : 'chevron-down'} />
            <span>Changes</span>
          </Button>
          <IconButton
            icon="collapse-all"
            label="Collapse All Repositories"
            disabled={!git.repositories.some(repository => !repository.collapsed)}
            onClick={() =>
              git.repositories
                .filter(repository => !repository.collapsed)
                .forEach(repository => git.collapse(repository.path))
            }
          />
        </div>
        {!collapsed &&
          git.repositories.map(repository => (
            <Repository
              key={repository.path}
              git={git}
              repository={repository}
              name={labels.get(repository.path)!}
              onContextMenu={event => {
                event.preventDefault();
                const panel = (event.currentTarget as Element)
                  .closest('.scratch-tab-git')!
                  .getBoundingClientRect();
                setContext({
                  repository: repository.path,
                  x: event.clientX - panel.left,
                  y: event.clientY - panel.top,
                });
              }}
            />
          ))}
        {!collapsed && git.closed > 0 && (
          <Button class="scratch-tab-git-reopen" onClick={git.reopen}>
            Reopen {git.closed} Closed {git.closed === 1 ? 'Repository' : 'Repositories'}
          </Button>
        )}
      </section>
      {!graphCollapsed && (
        <Splitter
          class="scratch-tab-graph-splitter"
          orientation="horizontal"
          label="Resize Graph"
          controls={graphId}
          invert
          size={handle => handle.nextElementSibling!.getBoundingClientRect().height}
          // Keep the title bar and at least one repository row above the graph.
          bounds={handle => [60, handle.parentElement!.clientHeight - 150]}
          onResize={graph.resize}
        />
      )}
      <Graph
        git={git}
        names={labels}
        id={graphId}
        height={graph.size}
        collapsed={graphCollapsed}
        setCollapsed={setGraphCollapsed}
      />
      {context && (
        <ContextMenu
          target={context}
          onClose={() => setContext(null)}
          items={[
            ['Close Repository', () => git.close([context.repository])],
            [
              'Close Other Repositories',
              () =>
                git.close(
                  git.repositories
                    .map(repository => repository.path)
                    .filter(path => path !== context.repository),
                ),
              git.repositories.length < 2,
            ],
          ]}
        />
      )}
      <p
        class={`scratch-tab-git-status ${git.error ? 'scratch-tab-error' : ''}`}
        role={git.error ? 'alert' : 'status'}
      >
        {git.busy ? 'Running Git…' : git.error || git.notice}
      </p>
    </aside>
  );
}
