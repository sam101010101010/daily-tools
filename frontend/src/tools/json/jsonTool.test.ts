import { expect, test } from 'vitest';
import { formatJson, minifyJson, validateJson } from './jsonTool';

test('format pretty-prints valid json', () => {
  expect(formatJson('{"a":1}', 2)).toEqual({ ok: true, output: '{\n  "a": 1\n}' });
});
test('minify strips whitespace', () => {
  expect(minifyJson('{ "a": 1 }')).toEqual({ ok: true, output: '{"a":1}' });
});
test('invalid json reports an error, not a throw', () => {
  const r = validateJson('{bad}');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/./);
});
