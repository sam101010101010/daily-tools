import { expect, test } from 'vitest';
import { decodeUrlComponent, encodeUrlComponent } from './url';

test('encodes a URL component with Unicode, spaces, plus signs, and reserved characters', () => {
  expect(encodeUrlComponent('a b+c/中文?x=y&z')).toBe('a%20b%2Bc%2F%E4%B8%AD%E6%96%87%3Fx%3Dy%26z');
});

test('decodes a percent-encoded URL component', () => {
  expect(decodeUrlComponent('a%20b%2Bc%2F%E4%B8%AD%E6%96%87')).toEqual({
    ok: true,
    value: 'a b+c/中文',
  });
});

test('keeps a literal plus sign when decoding a URL component', () => {
  expect(decodeUrlComponent('a+b')).toEqual({ ok: true, value: 'a+b' });
});

test('reports malformed percent escapes without throwing', () => {
  expect(decodeUrlComponent('%E0%A4%A')).toEqual({
    ok: false,
    error: 'URL 编码格式无效，无法解码',
  });
});
