import { expect, test } from 'vitest';
import { encodeBase64, decodeBase64, encodeHex, decodeHex } from './codec';

// --- base64 (moved verbatim from tools/base64; characterization guards the move) ---

test('base64 round-trips utf-8 text', () => {
  const enc = encodeBase64('héllo 世界');
  expect(decodeBase64(enc)).toEqual({ ok: true, output: 'héllo 世界' });
});

test('base64 url-safe encoding drops padding and uses -_', () => {
  expect(encodeBase64('~~~?', true)).not.toMatch(/[+/=]/);
});

test('base64 invalid input reports an error', () => {
  expect(decodeBase64('!!!not-base64!!!').ok).toBe(false);
});

// --- hex (new) ---

test('hex round-trips utf-8 text', () => {
  expect(decodeHex(encodeHex('héllo 世界'))).toEqual({ ok: true, output: 'héllo 世界' });
});

test('hex encodes to lowercase two-digit bytes', () => {
  expect(encodeHex('AB')).toBe('4142'); // 'A'=0x41, 'B'=0x42
});

test('hex tolerates whitespace between bytes', () => {
  expect(decodeHex('48 65 6c 6c 6f')).toEqual({ ok: true, output: 'Hello' });
});

test('hex odd-length input reports an error', () => {
  expect(decodeHex('abc')).toEqual({ ok: false, error: '不是合法的 Hex 输入' });
});

test('hex non-hex characters report an error', () => {
  expect(decodeHex('zz').ok).toBe(false);
});
