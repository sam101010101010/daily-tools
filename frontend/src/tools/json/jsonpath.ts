// A pragmatic JSONPath subset over an already-parsed JSON value.
//
// Supported: $ (root), .key, ['key'] / ["key"], [n] (n may be negative),
// [*] and .* (wildcard over array elements / object values), and .. recursive
// descent (`$..key`, `$..['key']`, `$..*`). Filters/slices/unions are not
// supported — this is a tool-page convenience, not full RFC 9535.

export interface JsonPathResult { ok: boolean; matches?: unknown[]; error?: string; }

type Sel =
  | { t: 'child'; key: string }
  | { t: 'index'; i: number }
  | { t: 'wildcard' }
  | { t: 'descend'; key?: string };

interface Bracket { sel?: Sel; next?: number; error?: string }

function parseBracket(s: string, i: number): Bracket {
  let j = i + 1; // past '['
  while (s[j] === ' ') j++;
  if (s[j] === '*') {
    j++; while (s[j] === ' ') j++;
    return s[j] === ']' ? { sel: { t: 'wildcard' }, next: j + 1 } : { error: "expected ']'" };
  }
  if (s[j] === "'" || s[j] === '"') {
    const q = s[j]; j++;
    let key = '';
    while (j < s.length && s[j] !== q) { key += s[j]; j++; }
    if (s[j] !== q) return { error: 'unterminated quoted key' };
    j++; while (s[j] === ' ') j++;
    return s[j] === ']' ? { sel: { t: 'child', key }, next: j + 1 } : { error: "expected ']'" };
  }
  const numRe = /-?\d+/y; numRe.lastIndex = j;
  const m = numRe.exec(s);
  if (m && m.index === j) {
    j = numRe.lastIndex; while (s[j] === ' ') j++;
    return s[j] === ']' ? { sel: { t: 'index', i: parseInt(m[0], 10) }, next: j + 1 } : { error: "expected ']'" };
  }
  return { error: `invalid bracket at ${i}` };
}

function parsePath(path: string): { sels?: Sel[]; error?: string } {
  const s = path.trim();
  if (s[0] !== '$') return { error: "path must start with '$'" };
  const idRe = /[A-Za-z_$][\w$]*/y;
  const sels: Sel[] = [];
  let i = 1;
  while (i < s.length) {
    if (s[i] === '.' && s[i + 1] === '.') {
      i += 2;
      if (s[i] === '*') { sels.push({ t: 'descend' }); i++; continue; }
      if (s[i] === '[') {
        const br = parseBracket(s, i);
        if (br.error) return { error: br.error };
        if (br.sel!.t === 'child') sels.push({ t: 'descend', key: br.sel!.key });
        else if (br.sel!.t === 'wildcard') sels.push({ t: 'descend' });
        else return { error: 'recursive descent with a numeric index is not supported' };
        i = br.next!;
        continue;
      }
      idRe.lastIndex = i;
      const m = idRe.exec(s);
      if (!m || m.index !== i) return { error: `expected a key after '..' at ${i}` };
      sels.push({ t: 'descend', key: m[0] });
      i = idRe.lastIndex;
      continue;
    }
    if (s[i] === '.') {
      i++;
      if (s[i] === '*') { sels.push({ t: 'wildcard' }); i++; continue; }
      idRe.lastIndex = i;
      const m = idRe.exec(s);
      if (!m || m.index !== i) return { error: `expected a key after '.' at ${i}` };
      sels.push({ t: 'child', key: m[0] });
      i = idRe.lastIndex;
      continue;
    }
    if (s[i] === '[') {
      const br = parseBracket(s, i);
      if (br.error) return { error: br.error };
      sels.push(br.sel!);
      i = br.next!;
      continue;
    }
    return { error: `unexpected character '${s[i]}' at ${i}` };
  }
  return { sels };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function applySel(nodes: unknown[], sel: Sel): unknown[] {
  const out: unknown[] = [];
  for (const n of nodes) {
    switch (sel.t) {
      case 'child':
        if (isPlainObject(n) && sel.key in n) out.push(n[sel.key]);
        break;
      case 'index':
        if (Array.isArray(n)) {
          const idx = sel.i < 0 ? n.length + sel.i : sel.i;
          if (idx >= 0 && idx < n.length) out.push(n[idx]);
        }
        break;
      case 'wildcard':
        if (Array.isArray(n)) out.push(...n);
        else if (isPlainObject(n)) out.push(...Object.values(n));
        break;
      case 'descend': {
        const collect = (v: unknown) => {
          if (sel.key === undefined) out.push(v);
          else if (isPlainObject(v) && sel.key in v) out.push(v[sel.key]);
          if (Array.isArray(v)) for (const el of v) collect(el);
          else if (isPlainObject(v)) for (const val of Object.values(v)) collect(val);
        };
        collect(n);
        break;
      }
    }
  }
  return out;
}

export function queryJsonPath(value: unknown, path: string): JsonPathResult {
  const p = parsePath(path);
  if (p.error) return { ok: false, error: p.error };
  let nodes: unknown[] = [value];
  for (const sel of p.sels!) nodes = applySel(nodes, sel);
  return { ok: true, matches: nodes };
}
