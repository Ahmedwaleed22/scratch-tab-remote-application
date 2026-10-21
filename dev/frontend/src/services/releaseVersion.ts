type Version = readonly [major: bigint, minor: bigint, patch: bigint];

export function isNewer(version: string, current: string): boolean {
  const parse = (value: string): Version | null => {
    const [, major, minor, patch] = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value) ?? [];
    if (major === undefined || minor === undefined || patch === undefined) return null;
    return [BigInt(major), BigInt(minor), BigInt(patch)];
  };
  const next = parse(version),
    old = parse(current);
  if (!next || !old) return false;
  if (next[0] !== old[0]) return next[0] > old[0];
  if (next[1] !== old[1]) return next[1] > old[1];
  return next[2] > old[2];
}
