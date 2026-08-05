import { expect, test, vi } from 'vitest';
import { MAX_DER_BYTES, parseSinglePem } from './pem';

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function pem(label: string, der: Uint8Array): string {
  return `-----BEGIN ${label}-----\n${base64(der).replace(/.{1,64}/g, '$&\n')}-----END ${label}-----`;
}

test.each([
  ['CERTIFICATE'],
  ['CERTIFICATE REQUEST'],
  ['NEW CERTIFICATE REQUEST'],
])('accepts one %s PEM block with surrounding whitespace and wrapped base64', label => {
  const der = Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x01]);

  expect(parseSinglePem(` \r\n${pem(label, der).replace(/\n/g, '\r\n')}\n\t`)).toEqual({
    ok: true,
    value: { label, der },
  });
});

test('accepts exactly one MiB of DER data', () => {
  const der = new Uint8Array(MAX_DER_BYTES).fill(0x5a);

  const result = parseSinglePem(pem('CERTIFICATE', der));

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected the boundary PEM to parse.');
  expect(result.value.label).toBe('CERTIFICATE');
  expect(result.value.der).toHaveLength(MAX_DER_BYTES);
  expect(result.value.der.every(byte => byte === 0x5a)).toBe(true);
});

test.each([
  ['empty input', '', '提供的内容必须是一个完整的 PEM 块。'],
  ['malformed base64', '-----BEGIN CERTIFICATE-----\n%%%\n-----END CERTIFICATE-----', 'PEM 内容不是规范的 Base64 编码。'],
  ['non-canonical base64', '-----BEGIN CERTIFICATE-----\nAB==\n-----END CERTIFICATE-----', 'PEM 内容不是规范的 Base64 编码。'],
  ['mismatched boundaries', '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE REQUEST-----', 'PEM 的开始和结束标签必须匹配。'],
  ['two PEM blocks', `${pem('CERTIFICATE', Uint8Array.of(0))}\n${pem('CERTIFICATE REQUEST', Uint8Array.of(0))}`, 'PEM 的开始和结束标签必须匹配。'],
  ['text before PEM', `not a PEM\n${pem('CERTIFICATE', Uint8Array.of(0))}`, '提供的内容必须是一个完整的 PEM 块。'],
  ['text after PEM', `${pem('CERTIFICATE', Uint8Array.of(0))}\nnot a PEM`, '提供的内容必须是一个完整的 PEM 块。'],
  ['private key', pem('PRIVATE KEY', Uint8Array.of(0)), '不支持该 PEM 标签。'],
  ['unknown label', pem('PKCS7', Uint8Array.of(0)), '不支持该 PEM 标签。'],
])('rejects %s with a stable PEM error', (_description, input, message) => {
  expect(parseSinglePem(input)).toEqual({
    ok: false,
    error: {
      code: 'INVALID_PEM',
      message,
    },
  });
});

test('rejects a DER payload larger than one MiB', () => {
  expect(parseSinglePem(pem('CERTIFICATE', new Uint8Array(MAX_DER_BYTES + 1)))).toEqual({
    ok: false,
    error: { code: 'INVALID_PEM', message: 'PEM 解码后的内容超过 1 MiB 限制。' },
  });
});

test('rejects an oversized Base64 payload before invoking the decoder', () => {
  const atobSpy = vi.spyOn(globalThis, 'atob');
  const encodedBytes = Math.ceil(MAX_DER_BYTES / 3) * 4;
  const input = `-----BEGIN CERTIFICATE-----\n${'A'.repeat(encodedBytes + 4)}\n-----END CERTIFICATE-----`;

  expect(parseSinglePem(input)).toEqual({
    ok: false,
    error: { code: 'INVALID_PEM', message: 'PEM 解码后的内容超过 1 MiB 限制。' },
  });
  expect(atobSpy.mock.calls).toHaveLength(0);
  atobSpy.mockRestore();
});
