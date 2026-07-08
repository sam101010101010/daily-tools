export interface JsonResult { ok: boolean; output?: string; error?: string; }
export interface ParseResult { value?: unknown; error?: string; }

export function parseJson(input: string): ParseResult {
  try { return { value: JSON.parse(input) }; }
  catch (e) { return { error: (e as Error).message }; }
}
export function formatJson(input: string, indent = 2): JsonResult {
  const p = parseJson(input);
  return p.error ? { ok: false, error: p.error } : { ok: true, output: JSON.stringify(p.value, null, indent) };
}
export function minifyJson(input: string): JsonResult {
  const p = parseJson(input);
  return p.error ? { ok: false, error: p.error } : { ok: true, output: JSON.stringify(p.value) };
}
export function validateJson(input: string): JsonResult {
  const p = parseJson(input);
  return p.error ? { ok: false, error: p.error } : { ok: true, output: 'valid' };
}
