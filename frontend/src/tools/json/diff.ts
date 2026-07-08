// Structural diff between two already-parsed JSON values. Objects diff by key,
// arrays diff by index. Result is a flat, document-ordered list of changes.

import { deepEqual } from './transforms';

export type DiffKind = 'add' | 'del' | 'change';
export interface DiffEntry { path: string; kind: DiffKind; before?: unknown; after?: unknown; }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function diffJson(a: unknown, b: unknown, path = '$'): DiffEntry[] {
  if (deepEqual(a, b)) return [];

  if (isPlainObject(a) && isPlainObject(b)) {
    const out: DiffEntry[] = [];
    for (const k of Object.keys(a)) {
      const child = `${path}.${k}`;
      if (!(k in b)) out.push({ path: child, kind: 'del', before: a[k] });
      else out.push(...diffJson(a[k], b[k], child));
    }
    for (const k of Object.keys(b)) {
      if (!(k in a)) out.push({ path: `${path}.${k}`, kind: 'add', after: b[k] });
    }
    return out;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const out: DiffEntry[] = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const child = `${path}[${i}]`;
      if (i >= a.length) out.push({ path: child, kind: 'add', after: b[i] });
      else if (i >= b.length) out.push({ path: child, kind: 'del', before: a[i] });
      else out.push(...diffJson(a[i], b[i], child));
    }
    return out;
  }

  return [{ path, kind: 'change', before: a, after: b }];
}
