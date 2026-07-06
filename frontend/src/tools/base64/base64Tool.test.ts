import { expect, test } from 'vitest';
import { encodeBase64, decodeBase64 } from './base64Tool';

test('round-trips utf-8 text', () => {
  const enc = encodeBase64('héllo 世界');
  expect(decodeBase64(enc)).toEqual({ ok: true, output: 'héllo 世界' });
});
test('url-safe encoding drops padding and uses -_', () => {
  expect(encodeBase64('~~~?', true)).not.toMatch(/[+/=]/);
});
test('invalid input reports an error', () => {
  expect(decodeBase64('!!!not-base64!!!').ok).toBe(false);
});
