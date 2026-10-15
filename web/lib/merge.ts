export type Stamped = {
  id: string;
  updatedAt: string;
};

export function stampValue(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function preferRecord<T extends Stamped>(current: T | undefined, incoming: T): T {
  if (!current) return incoming;
  const left = stampValue(current.updatedAt);
  const right = stampValue(incoming.updatedAt);
  if (right !== left) return right > left ? incoming : current;
  return incoming.updatedAt >= current.updatedAt ? incoming : current;
}

export function mergeLists(local: readonly Stamped[], remote: readonly Stamped[]): Stamped[] {
  return mergeByUpdatedAt([...local], [...remote]);
}

export function mergeByUpdatedAt<T extends Stamped>(local: T[], remote: T[]): T[] {
  const map = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) map.set(item.id, preferRecord(map.get(item.id), item));
  return [...map.values()];
}

export function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
