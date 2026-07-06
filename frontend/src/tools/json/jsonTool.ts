export interface JsonResult { ok: boolean; output?: string; error?: string; }

function parse(input: string): { value?: unknown; error?: string } {
  try { return { value: JSON.parse(input) }; }
  catch (e) { return { error: (e as Error).message }; }
}
export function formatJson(input: string, indent = 2): JsonResult {
  const p = parse(input);
  return p.error ? { ok: false, error: p.error } : { ok: true, output: JSON.stringify(p.value, null, indent) };
}
export function minifyJson(input: string): JsonResult {
  const p = parse(input);
  return p.error ? { ok: false, error: p.error } : { ok: true, output: JSON.stringify(p.value) };
}
export function validateJson(input: string): JsonResult {
  const p = parse(input);
  return p.error ? { ok: false, error: p.error } : { ok: true, output: 'valid' };
}
