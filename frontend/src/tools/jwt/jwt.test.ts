import { expect, test } from 'vitest';
import { decodeJwt, formatNumericDate } from './jwt';

function base64url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function compactToken(header: unknown, payload: unknown, signature = 'c2ln'): string {
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.${signature}`;
}

test('decodes a compact HS256 token and preserves its raw signature segment', () => {
  const token = compactToken(
    { alg: 'HS256', typ: 'JWT' },
    { sub: '123', exp: 1_763_462_400 },
    'cmF3LXNpZw',
  );

  expect(decodeJwt(token)).toEqual({
    ok: true,
    value: {
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { sub: '123', exp: 1_763_462_400 },
      signature: 'cmF3LXNpZw',
    },
  });
});

test('decodes Unicode JSON, unpadded base64url, and surrounding whitespace', () => {
  const token = compactToken({ alg: 'HS256' }, { message: '你好，世界 👋' });

  expect(decodeJwt(` \n${token}\t `)).toEqual({
    ok: true,
    value: {
      header: { alg: 'HS256' },
      payload: { message: '你好，世界 👋' },
      signature: 'c2ln',
    },
  });
});

test.each([
  ['two segments', 'header.payload'],
  ['four segments', 'header.payload.signature.extra'],
  ['five segments', 'header.payload.signature.extra.more'],
  ['empty header', '.eyJzdWIiOiIxMjMifQ.signature'],
  ['empty payload', 'eyJhbGciOiJIUzI1NiJ9..signature'],
])('rejects invalid compact structure: %s', (_description, token) => {
  expect(decodeJwt(token)).toEqual({ ok: false, error: 'JWT 必须是三段紧凑 JWS 格式' });
});

test.each([
  ['invalid base64url characters', '%%%'],
  ['invalid base64url length', 'a'],
  ['non-canonical base64url padding bits', 'AB'],
])('rejects header with %s', (_description, header) => {
  expect(decodeJwt(`${header}.${base64url('{}')}.signature`)).toEqual({
    ok: false,
    error: 'JWT Header 不是合法的 Base64URL',
  });
});

test('rejects an invalid base64url signature segment without parsing it as JSON', () => {
  expect(decodeJwt(`${base64url('{}')}.${base64url('{}')}.not%base64url`)).toEqual({
    ok: false,
    error: 'JWT 签名不是合法的 Base64URL',
  });
});

test.each([
  ['an empty segment', ''],
  ['an impossible base64url length', 'a'],
  ['non-canonical base64url padding bits', 'AB'],
])('rejects a signature with %s', (_description, signature) => {
  expect(decodeJwt(`${base64url('{}')}.${base64url('{}')}.${signature}`)).toEqual({
    ok: false,
    error: 'JWT 签名不是合法的 Base64URL',
  });
});

test('rejects non-UTF-8 header bytes', () => {
  expect(decodeJwt(`_w.${base64url('{}')}.signature`)).toEqual({
    ok: false,
    error: 'JWT Header 不是有效的 UTF-8',
  });
});

test('rejects malformed JSON', () => {
  expect(decodeJwt(`${base64url('{')}.${base64url('{}')}.signature`)).toEqual({
    ok: false,
    error: 'JWT Header 不是合法的 JSON',
  });
});

test.each([
  ['array', '[]'],
  ['string scalar', '"jwt"'],
  ['number scalar', '42'],
  ['null scalar', 'null'],
])('rejects a JSON %s instead of an object', (_description, header) => {
  expect(decodeJwt(`${base64url(header)}.${base64url('{}')}.signature`)).toEqual({
    ok: false,
    error: 'JWT Header 必须是 JSON 对象',
  });
});

test.each([
  ['array', '[]'],
  ['string scalar', '"jwt"'],
  ['number scalar', '42'],
  ['null scalar', 'null'],
])('rejects a payload JSON %s instead of an object', (_description, payload) => {
  expect(decodeJwt(`${base64url('{}')}.${base64url(payload)}.signature`)).toEqual({
    ok: false,
    error: 'JWT Payload 必须是 JSON 对象',
  });
});

test('returns immutable decoded values', () => {
  const result = decodeJwt(compactToken({ alg: 'HS256', nested: { key: 'value' } }, { roles: ['reader'] }));

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.header)).toBe(true);
  expect(Object.isFrozen(result.value.payload)).toBe(true);
  expect(Object.isFrozen(result.value.header.nested)).toBe(true);
  expect(Object.isFrozen(result.value.payload.roles)).toBe(true);
});

test('rejects JSON beyond the safe structural depth before it reaches UI formatting', () => {
  const depth = 10_000;
  const payload = `${'{"nested":'.repeat(depth)}0${'}'.repeat(depth)}`;
  const token = `${base64url('{"alg":"HS256"}')}.${base64url(payload)}.c2ln`;

  expect(decodeJwt(token)).toEqual({
    ok: false,
    error: 'JWT Payload 嵌套层级超过 100，无法安全显示',
  });
});

test('rejects JSON numeric overflow instead of fabricating a NumericDate display', () => {
  const token = `${base64url('{"alg":"HS256"}')}.${base64url('{"exp":1e400}')}.c2ln`;

  expect(decodeJwt(token)).toEqual({
    ok: false,
    error: 'JWT Payload 的 JSON 包含无法安全解析的非有限数字',
  });
});

test('formats finite NumericDate values including zero, negatives, and fractions', () => {
  expect(formatNumericDate(0)).toBe(new Date(0).toLocaleString());
  expect(formatNumericDate(-1)).toBe(new Date(-1_000).toLocaleString());
  expect(formatNumericDate(1.5)).toBe(new Date(1_500).toLocaleString());
});

test.each([Number.NaN, Infinity, -Infinity, '0', null])('does not format non-finite NumericDate values', value => {
  expect(formatNumericDate(value)).toBeUndefined();
});
