export function isNewer(version: string, current: string) {
  const parse = (value: string) =>
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.split('.').map(BigInt) : null;
  const next = parse(version),
    old = parse(current);
  if (!next || !old) return false;
  for (let i = 0; i < 3; i++) if (next[i] !== old[i]) return next[i] > old[i];
  return false;
}
