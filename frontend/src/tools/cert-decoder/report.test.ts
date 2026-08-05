/// <reference types="node" />

import * as asn1js from 'asn1js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Certificate } from 'pkijs';
import { describe, expect, test } from 'vitest';
import { parsePkiDer } from './asn1';
import { parseSinglePem } from './pem';
import { mapCertificate } from './report';

const FIXTURE_DIRECTORY = resolve(process.cwd(), 'src/tools/cert-decoder/fixtures');
const rsaCertificatePem = readFileSync(resolve(FIXTURE_DIRECTORY, 'rsa-certificate.pem'), 'utf8');
const ecdsaCertificatePem = readFileSync(resolve(FIXTURE_DIRECTORY, 'ecdsa-certificate.pem'), 'utf8');
const issuerSignedEdgeCertificatePem = readFileSync(
  resolve(FIXTURE_DIRECTORY, 'issuer-signed-edge-certificate.pem'),
  'utf8',
);

function parseCertificate(pem: string): { certificate: Certificate; der: Uint8Array } {
  const pemResult = parseSinglePem(pem);
  expect(pemResult.ok).toBe(true);
  if (!pemResult.ok) throw new Error('fixture PEM did not parse');

  const pkiResult = parsePkiDer(pemResult.value.der, 'CERTIFICATE');
  expect(pkiResult.ok).toBe(true);
  if (!pkiResult.ok || !(pkiResult.value instanceof Certificate)) {
    throw new Error('fixture certificate did not parse');
  }

  return { certificate: pkiResult.value, der: pemResult.value.der };
}

function propertyNames(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(propertyNames);
  return Object.entries(value).flatMap(([key, child]) => [key, ...propertyNames(child)]);
}

function expectPlainTextDto(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(expectPlainTextDto);
    return;
  }

  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  Object.values(value).forEach(expectPlainTextDto);
}

describe('mapCertificate', () => {
  test('preserves encoded DN order and maps stable identity, validity, algorithms and fingerprint', async () => {
    // Catches DN sorting/value loss, local-time dates, a non-injected clock,
    // friendly names without OIDs, and hashing anything except complete DER.
    const { certificate, der } = parseCertificate(rsaCertificatePem);

    const report = await mapCertificate(certificate, der, new Date('2030-01-01T00:00:00.000Z'));

    expect(report.version).toBe(3);
    expect(report.serialNumber).toBe('102030405060708090A0B0C0D0E0F010');
    expect(report.subject).toEqual([
      { oid: '2.5.4.6', name: 'Country', value: 'US' },
      { oid: '2.5.4.10', name: 'Organization', value: 'Daily Tools Lab' },
      { oid: '2.5.4.11', name: 'Organizational Unit', value: 'Certificate Fixtures' },
      { oid: '2.5.4.3', name: 'Common Name', value: 'rsa.example.test' },
      { oid: '1.2.840.113549.1.9.1', name: 'Email Address', value: 'ops@example.test' },
      { oid: '1.2.3.4.5', name: 'unknown', value: 'Research Unit' },
    ]);
    expect(report.issuer).toEqual([
      { oid: '2.5.4.6', name: 'Country', value: 'US' },
      { oid: '2.5.4.10', name: 'Organization', value: 'Daily Tools Lab' },
      { oid: '2.5.4.11', name: 'Organizational Unit', value: 'Certificate Fixtures' },
      { oid: '2.5.4.3', name: 'Common Name', value: 'rsa.example.test' },
      { oid: '1.2.840.113549.1.9.1', name: 'Email Address', value: 'ops@example.test' },
      { oid: '1.2.3.4.5', name: 'unknown', value: 'Research Unit' },
    ]);
    expect(report.validity).toEqual({
      notBefore: '2026-08-04T06:38:48.000Z',
      notAfter: '2053-12-20T06:38:48.000Z',
      state: 'valid',
    });
    expect(report.signatureAlgorithm).toEqual({
      oid: '1.2.840.113549.1.1.11',
      name: 'SHA-256 with RSA',
    });
    expect(report.publicKeyAlgorithm).toEqual({
      oid: '1.2.840.113549.1.1.1',
      name: 'RSA',
    });
    expect(report.fingerprintSha256).toBe(
      'FF:69:D5:D0:34:43:AC:FE:E1:7B:7A:5D:6C:18:7E:70:52:30:C3:A2:80:B4:EC:A2:17:DD:BB:ED:6D:EB:D3:39',
    );
  });

  test('maps a CA-signed certificate issuer independently from its subject', async () => {
    // Catches mapping issuer from certificate.subject: the fixture has a
    // deliberately different, literal issuer DN and subject DN.
    const { certificate, der } = parseCertificate(issuerSignedEdgeCertificatePem);

    const report = await mapCertificate(certificate, der, new Date('2027-01-01T00:00:00.000Z'));

    expect(report.subject).toEqual([
      { oid: '2.5.4.6', name: 'Country', value: 'DE' },
      { oid: '2.5.4.10', name: 'Organization', value: 'Daily Tools Client' },
      { oid: '2.5.4.3', name: 'Common Name', value: 'edge.example.test' },
    ]);
    expect(report.issuer).toEqual([
      { oid: '2.5.4.6', name: 'Country', value: 'US' },
      { oid: '2.5.4.10', name: 'Organization', value: 'Daily Tools Lab' },
      { oid: '2.5.4.11', name: 'Organizational Unit', value: 'Certificate Fixtures' },
      { oid: '2.5.4.3', name: 'Common Name', value: 'rsa.example.test' },
      { oid: '1.2.840.113549.1.9.1', name: 'Email Address', value: 'ops@example.test' },
      { oid: '1.2.3.4.5', name: 'unknown', value: 'Research Unit' },
    ]);
  });

  test('canonicalizes a positive serial whose DER INTEGER requires leading 00 padding', async () => {
    // Catches exposing ASN.1 sign-padding octets instead of the certificate's
    // canonical positive serial value. The hand-checked serial begins at 0x80.
    const { certificate, der } = parseCertificate(issuerSignedEdgeCertificatePem);

    const report = await mapCertificate(certificate, der, new Date('2027-01-01T00:00:00.000Z'));

    expect(report.serialNumber).toBe('80A1B2C3D4E5F60718293A4B5C6D7E8F');
  });

  test('maps DNS, IP, email, URI and unknown SAN variants to a text-only union', async () => {
    // Catches GeneralName tag confusion, raw ASN.1 objects, and rendering an
    // unrecognized variant as trusted HTML or an unsafe decoded payload.
    const { certificate, der } = parseCertificate(rsaCertificatePem);

    const report = await mapCertificate(certificate, der, new Date('2030-01-01T00:00:00.000Z'));

    expect(report.subjectAlternativeNames).toEqual([
      { type: 'dns', value: 'rsa.example.test' },
      { type: 'ip', value: '192.0.2.42' },
      { type: 'email', value: 'security@example.test' },
      { type: 'uri', value: 'https://rsa.example.test/certificate' },
      {
        type: 'unknown',
        tag: 0,
        value: 'A0:27:06:08:2B:06:01:05:05:07:08:05:A0:1B:0C:19:66:69:78:74:75:72:65:2D:75:73:65:72:40:65:78:61:6D:70:6C:65:2E:74:65:73:74',
      },
    ]);
    expect(JSON.stringify(report.subjectAlternativeNames)).not.toMatch(/[<>]/);
    expectPlainTextDto(report.subjectAlternativeNames);
  });

  test('maps object-valued GeneralNames without toBER to content-bearing safe text', async () => {
    // Catches directoryName and other PKI.js object values collapsing to
    // non-content-bearing JavaScript coercions such as "[object Object]".
    const { certificate, der } = parseCertificate(issuerSignedEdgeCertificatePem);

    const report = await mapCertificate(certificate, der, new Date('2027-01-01T00:00:00.000Z'));

    expect(report.subjectAlternativeNames).toEqual([{
      type: 'unknown',
      tag: 4,
      value: '30:4A:31:0B:30:09:06:03:55:04:06:13:02:4A:50:31:1A:30:18:06:03:55:04:0A:0C:11:44:69:72:65:63:74:6F:72:79:20:46:69:78:74:75:72:65:31:1F:30:1D:06:03:55:04:03:0C:16:64:69:72:65:63:74:6F:72:79:2E:65:78:61:6D:70:6C:65:2E:74:65:73:74',
    }]);
    expect(report.subjectAlternativeNames[0]?.value).not.toBe('[object Object]');
    expectPlainTextDto(report.subjectAlternativeNames);
  });

  test('maps basic constraints, key usage, EKU and unrecognized extensions without library objects', async () => {
    // Catches bit-order mistakes, dropped criticality/OIDs, and leaking parsed
    // PKI.js or ASN1js extension instances into the report.
    const { certificate, der } = parseCertificate(rsaCertificatePem);

    const report = await mapCertificate(certificate, der, new Date('2030-01-01T00:00:00.000Z'));

    expect(report.extensions).toEqual({
      basicConstraints: {
        oid: '2.5.29.19',
        critical: true,
        ca: true,
        pathLength: 0,
      },
      keyUsage: {
        oid: '2.5.29.15',
        critical: true,
        usages: ['digital-signature', 'key-cert-sign', 'crl-sign'],
      },
      extendedKeyUsage: {
        oid: '2.5.29.37',
        critical: false,
        purposes: [
          { oid: '1.3.6.1.5.5.7.3.1', name: 'TLS Web Server Authentication' },
          { oid: '1.3.6.1.5.5.7.3.2', name: 'TLS Web Client Authentication' },
          { oid: '1.3.6.1.5.5.7.3.3', name: 'Code Signing' },
        ],
      },
      unrecognized: [{
        oid: '1.2.3.4.99',
        critical: true,
        value: '0C:1B:53:79:6E:74:68:65:74:69:63:20:75:6E:6B:6E:6F:77:6E:20:65:78:74:65:6E:73:69:6F:6E',
      }],
    });
    expectPlainTextDto(report.extensions);
  });

  test('uses explicit absent extension values and all three injected-clock states', async () => {
    // Catches undefined optional DTO fields and boundary logic that uses the
    // runtime clock instead of the supplied Date.
    const { certificate, der } = parseCertificate(ecdsaCertificatePem);

    const before = await mapCertificate(certificate, der, new Date('2026-08-04T06:39:12.999Z'));
    const atStart = await mapCertificate(certificate, der, new Date('2026-08-04T06:39:13.000Z'));
    const after = await mapCertificate(certificate, der, new Date('2027-08-04T06:39:13.001Z'));

    expect(before.validity).toEqual({
      notBefore: '2026-08-04T06:39:13.000Z',
      notAfter: '2027-08-04T06:39:13.000Z',
      state: 'not-yet-valid',
    });
    expect(atStart.validity.state).toBe('valid');
    expect(after.validity.state).toBe('expired');
    expect(atStart.subjectAlternativeNames).toEqual([]);
    expect(atStart.extensions).toEqual({
      basicConstraints: null,
      keyUsage: null,
      extendedKeyUsage: null,
      unrecognized: [],
    });
    expect(atStart.signatureAlgorithm).toEqual({
      oid: '1.2.840.10045.4.3.3',
      name: 'ECDSA with SHA-384',
    });
    expect(atStart.publicKeyAlgorithm).toEqual({
      oid: '1.2.840.10045.2.1',
      name: 'EC',
    });
    expect(atStart.fingerprintSha256).toBe(
      'EA:AC:C0:BC:5A:93:BE:D1:89:0B:67:BD:EC:6F:45:33:F1:3E:4B:E6:DD:77:52:A5:D6:4B:6A:13:53:CB:65:6B',
    );
  });

  test('keeps an unrecognized algorithm truthful without declaring it invalid', async () => {
    // Catches an unknown OID being dropped, guessed, or converted into an
    // algorithm-validity or certificate-validity verdict.
    const { certificate, der } = parseCertificate(ecdsaCertificatePem);
    certificate.signatureAlgorithm.algorithmId = '1.2.3.4.12345';

    const report = await mapCertificate(certificate, der, new Date('2027-01-01T00:00:00.000Z'));

    expect(report.signatureAlgorithm).toEqual({ oid: '1.2.3.4.12345', name: 'unknown' });
    expect(propertyNames(report)).not.toEqual(expect.arrayContaining([
      'algorithmValid',
      'invalidAlgorithm',
      'trusted',
      'trustValid',
      'hostnameValid',
      'revoked',
      'revocationValid',
    ]));
  });

  test('returns a JSON-safe DTO with no class instances, raw HTML, private material or trust verdicts', async () => {
    // Catches accidental spreading of PKI.js/ASN1js instances or adding fields
    // that later UI code could mistake for private material or trust results.
    const { certificate, der } = parseCertificate(rsaCertificatePem);

    const report = await mapCertificate(certificate, der, new Date('2030-01-01T00:00:00.000Z'));
    const keys = propertyNames(report);
    const serialized = JSON.stringify(report);

    expectPlainTextDto(report);
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(keys.some(key => /html/i.test(key))).toBe(false);
    expect(keys).not.toEqual(expect.arrayContaining([
      'der',
      'privateKey',
      'privateMaterial',
      'trust',
      'trusted',
      'hostnameValid',
      'revoked',
      'revocationValid',
    ]));
    expect(serialized).not.toMatch(/BEGIN (?:RSA |EC )?PRIVATE KEY/);
    expect(serialized).not.toContain('<script');
    expect(report).not.toBeInstanceOf(Certificate);
    expect(report).not.toBeInstanceOf(asn1js.BaseBlock);
  });
});
