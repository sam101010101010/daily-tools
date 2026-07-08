// Pure whole-document operations over already-parsed JSON values.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Recursively sort object keys alphabetically; array element order is preserved. */
export function sortKeys(value: unknown, deep = true): unknown {
  if (Array.isArray(value)) return deep ? value.map((v) => sortKeys(v, deep)) : value;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = deep ? sortKeys(value[k], deep) : value[k];
    return out;
  }
  return value;
}

/** Canonical serialisation (keys sorted) — the equality key for dedupe / deepEqual. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** Deep, key-order-insensitive equality. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/** Recursively remove deep-equal duplicates from every array, keeping first occurrence. */
export function dedupe(value: unknown): unknown {
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const el of value) {
      const d = dedupe(el);
      const key = canonical(d);
      if (!seen.has(key)) { seen.add(key); out.push(d); }
    }
    return out;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = dedupe(v);
    return out;
  }
  return value;
}
