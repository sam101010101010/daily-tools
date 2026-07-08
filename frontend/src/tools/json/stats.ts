// Structural statistics over an already-parsed JSON value.

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
export interface JsonStats {
  nodes: number;
  depth: number;
  types: Record<JsonType, number>;
}

export function jsonTypeOf(v: unknown): JsonType {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'object') return 'object';
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'null';
}

export function jsonStats(value: unknown): JsonStats {
  const types: Record<JsonType, number> = { object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 0 };
  let nodes = 0;

  function walk(v: unknown): number {
    nodes++;
    types[jsonTypeOf(v)]++;
    if (Array.isArray(v)) {
      let max = 0;
      for (const el of v) max = Math.max(max, walk(el));
      return 1 + max;
    }
    if (v && typeof v === 'object') {
      let max = 0;
      for (const val of Object.values(v as Record<string, unknown>)) max = Math.max(max, walk(val));
      return 1 + max;
    }
    return 1;
  }

  const depth = walk(value);
  return { nodes, depth, types };
}
