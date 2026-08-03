import { expect, test } from 'vitest';
import { parsePkiDer } from './asn1';

const CERTIFICATE_DER = Uint8Array.from(atob(
  'MIIDHzCCAgegAwIBAgIUJY8ByeAtyl2TXbzTrjEGyIU7r1QwDQYJKoZIhvcNAQELBQAwHzEdMBsGA1UEAwwUTTIwIFRlc3QgQ2VydGlmaWNhdGUwHhcNMjYwODAzMDYzNDIyWhcNMjYwODA0MDYzNDIyWjAfMR0wGwYDVQQDDBRNMjAgVGVzdCBDZXJ0aWZpY2F0ZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAK6biTSX4r+gb8sYw/DuCcaYtRZg54NrAO1gw0GWmpS+70lmUWHlD5Brn4zAU1rNyJlNCyQPUWZxcEciAcsqiUcYESDTFjcEV9ZtULzz7t/jN0sNkPYjLNB12WhtkiFAzAfZo7X4y6d/VuxM3Qamv6el68chiVbci0d6kmnq2x//iUqxZDBt/ut6LRznHPjvGTk2bjWyKfS81jJSPIF9B2n1qxm248/PW2LANiLFRvXeChn83hu0AJpwT2TwqfoubFf5cpImdmB7zw8X33r2T9ojC3413dZpgbeYB5n4w9rna4TfO/cqmp/Gb9uTL2SaAEjQachMA+xU9tAllLaybnsCAwEAAaNTMFEwHQYDVR0OBBYEFOgtCnNL6yay+gMX60zPpXq5SrXwMB8GA1UdIwQYMBaAFOgtCnNL6yay+gMX60zPpXq5SrXwMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAC+82L/d64yIlHP/sb7tIq44fimwK5ewqlgOHwwSbhafhu0Ee5VbNgjtrKKJuADA34FPrJmTDyw2ephvKSpvEMSEul8U3yQHW5biJIliX49vCBxY9vCsCbrV77DD5cRhnwgnrFJb0tzF3PUzHZXCAwO1z8OvbcKTu3htDPkmbVUI+98hAhcteE5yR0ljHP8hcTVvHcjJU9w2zbOoJbDiwkqYBFz7sbiKg41x5Q5ZX8GvANob7Wz5XUZY5PgWCgPK4Jkxo4L00Xto3eBnj0bCC7Ne7v25fKDEGezyHBJEM5RxErJ1z+DC2sQJcTCuTvyBbmQXnJaQcX8er/TEDaGfdac=',
), character => character.charCodeAt(0));

const CERTIFICATE_REQUEST_DER = Uint8Array.from(atob(
  'MIICYDCCAUgCAQAwGzEZMBcGA1UEAwwQTTIwIFRlc3QgUmVxdWVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAK6biTSX4r+gb8sYw/DuCcaYtRZg54NrAO1gw0GWmpS+70lmUWHlD5Brn4zAU1rNyJlNCyQPUWZxcEciAcsqiUcYESDTFjcEV9ZtULzz7t/jN0sNkPYjLNB12WhtkiFAzAfZo7X4y6d/VuxM3Qamv6el68chiVbci0d6kmnq2x//iUqxZDBt/ut6LRznHPjvGTk2bjWyKfS81jJSPIF9B2n1qxm248/PW2LANiLFRvXeChn83hu0AJpwT2TwqfoubFf5cpImdmB7zw8X33r2T9ojC3413dZpgbeYB5n4w9rna4TfO/cqmp/Gb9uTL2SaAEjQachMA+xU9tAllLaybnsCAwEAAaAAMA0GCSqGSIb3DQEBCwUAA4IBAQChB3+TWkOPU3AUgtLXtaC8jm9aefBDGnfN6Q9DL+3NwDx8D4mDzk3BatAvFEKsAZJnE5U5dqeAlc8O3/ir88U2ijmZtkPh33W7DaEXI8QZAjh3jf+4XFGvKkN/BK1onxYSfvRqhlsX+MYBU9wFBKSM3V7DeYzEXeQbIB+x3g74Litec5O67n2Sfl+ra1ibpBPSrDEZDq3ie6n5WxGym2KbtCtrA02RX5S/nny9aaWyXQZTe048E2ES13Cd3WEm6H1YW6JrfSxxKV75xnacyjsey/N8MhGiu+jnc+bdCHcU5sfsaZQnayPWztYTBuV0K4w0uoUhGwxJuY9y7HBlSt/N',
), character => character.charCodeAt(0));

function length(value: number): number[] {
  if (value < 0x80) return [value];
  const bytes: number[] = [];
  for (let remaining = value; remaining > 0; remaining >>>= 8) bytes.unshift(remaining & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function sequence(contents: Uint8Array): Uint8Array {
  return Uint8Array.from([0x30, ...length(contents.length), ...contents]);
}

function deeplyNestedSequence(depth: number): Uint8Array {
  let result: Uint8Array = Uint8Array.of(0x05, 0x00);
  for (let index = 0; index < depth; index += 1) result = sequence(result);
  return result;
}

function expectInvalidAsn1(
  der: Uint8Array,
  message = '内容不是受支持的有效 ASN.1 证书或证书请求。',
): void {
  const result = parsePkiDer(der, 'CERTIFICATE');
  expect(result).toEqual({
    ok: false,
    error: {
      code: 'INVALID_ASN1',
      message,
    },
  });
}

test('constructs only a PKI.js Certificate for a complete certificate DER', () => {
  const result = parsePkiDer(CERTIFICATE_DER, 'CERTIFICATE');

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.constructor.name).toBe('Certificate');
});

test.each([
  ['CERTIFICATE REQUEST', CERTIFICATE_REQUEST_DER, 'CertificationRequest'],
  ['NEW CERTIFICATE REQUEST', CERTIFICATE_REQUEST_DER, 'CertificationRequest'],
] as const)('constructs a PKI.js %s object only for the matching request label', (label, der, className) => {
  const result = parsePkiDer(der, label);

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.constructor.name).toBe(className);
});

test.each([
  ['truncated long-form length', Uint8Array.of(0x30, 0x82, 0x01)],
  ['depth over 100', deeplyNestedSequence(100), 'ASN.1 嵌套层级超过 100，无法安全处理。'],
  ['more than 10,000 ASN.1 nodes', sequence(new Uint8Array(20_002).fill(0).map((_, index) => index % 2 === 0 ? 0x05 : 0x00))],
  ['content over one MiB', Uint8Array.from([0x04, ...length(1_048_577), ...new Uint8Array(1_048_577)])],
  ['random bytes', Uint8Array.of(0x97, 0x4c, 0x23, 0xff, 0x00, 0xc1)],
])('rejects %s without exposing parser details', (_description, der, message?: string) => {
  expectInvalidAsn1(der, message);
});
