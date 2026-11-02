import type { GitCommit } from './git.js';

/** `top` runs from a lane at the row's top edge into the node; `bottom` leaves the node for a lane at the bottom edge. */
export interface GraphEdge {
  kind: 'pass' | 'top' | 'bottom';
  from: number;
  to: number;
  color: number;
}
export interface GraphRow {
  commit: GitCommit;
  column: number;
  color: number;
  width: number;
  edges: GraphEdge[];
}

type Lane = { hash: string; color: number } | null;

/** Assigns each commit (in topological order) a lane, like VS Code's Source Control graph. */
export function layoutGraph(commits: GitCommit[]): GraphRow[] {
  const lanes: Lane[] = [];
  let colors = 0;
  const free = (except: number): number => {
    const index = lanes.findIndex((lane, i) => lane === null && i !== except);
    return index === -1 ? lanes.length : index;
  };
  return commits.map(commit => {
    const edges: GraphEdge[] = [];
    let column = lanes.findIndex(lane => lane?.hash === commit.hash);
    if (column === -1) {
      column = free(-1);
      lanes[column] = { hash: commit.hash, color: colors++ };
    } else edges.push({ kind: 'top', from: column, to: column, color: lanes[column]!.color });
    const color = lanes[column]!.color;
    lanes.forEach((lane, index) => {
      if (index === column || !lane) return;
      if (lane.hash === commit.hash) {
        edges.push({ kind: 'top', from: index, to: column, color: lane.color });
        lanes[index] = null;
      } else edges.push({ kind: 'pass', from: index, to: index, color: lane.color });
    });
    const before = lanes.length;
    const [first, ...others] = commit.parents;
    lanes[column] = first ? { hash: first, color } : null;
    if (first) edges.push({ kind: 'bottom', from: column, to: column, color });
    for (const parent of others) {
      let target = lanes.findIndex(lane => lane?.hash === parent);
      if (target === -1) {
        target = free(column);
        lanes[target] = { hash: parent, color: colors++ };
      }
      edges.push({ kind: 'bottom', from: column, to: target, color: lanes[target]!.color });
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    return { commit, column, color, width: Math.max(before, lanes.length, column + 1), edges };
  });
}
