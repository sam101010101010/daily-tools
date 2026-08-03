import { expect, test } from 'vitest';
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

  expect(result).toEqual({ ok: true, value: { label: 'CERTIFICATE', der } });
});

test.each([
  ['empty input', ''],
  ['malformed base64', '-----BEGIN CERTIFICATE-----\n%%%\n-----END CERTIFICATE-----'],
  ['non-canonical base64', '-----BEGIN CERTIFICATE-----\nAB==\n-----END CERTIFICATE-----'],
  ['mismatched boundaries', '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE REQUEST-----'],
  ['two PEM blocks', `${pem('CERTIFICATE', Uint8Array.of(0))}\n${pem('CERTIFICATE REQUEST', Uint8Array.of(0))}`],
  ['text before PEM', `not a PEM\n${pem('CERTIFICATE', Uint8Array.of(0))}`],
  ['text after PEM', `${pem('CERTIFICATE', Uint8Array.of(0))}\nnot a PEM`],
  ['private key', pem('PRIVATE KEY', Uint8Array.of(0))],
  ['unknown label', pem('PKCS7', Uint8Array.of(0))],
])('rejects %s with a stable PEM error', (_description, input) => {
  expect(parseSinglePem(input)).toMatchObject({ ok: false, error: { code: 'INVALID_PEM' } });
});

test('rejects a DER payload larger than one MiB', () => {
  expect(parseSinglePem(pem('CERTIFICATE', new Uint8Array(MAX_DER_BYTES + 1)))).toMatchObject({
    ok: false,
    error: { code: 'INVALID_PEM' },
  });
});
