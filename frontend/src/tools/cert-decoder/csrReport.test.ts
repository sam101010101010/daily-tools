/// <reference types="node" />

import * as asn1js from 'asn1js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CertificationRequest } from 'pkijs';
import { describe, expect, test } from 'vitest';
import { parsePkiDer } from './asn1';
import { parseSinglePem } from './pem';
import { mapCertificationRequest } from './report';

const FIXTURE_DIRECTORY = resolve(process.cwd(), 'src/tools/cert-decoder/fixtures');

function parseRequest(filename: string): { request: CertificationRequest; der: Uint8Array } {
  const pem = readFileSync(resolve(FIXTURE_DIRECTORY, filename), 'utf8');
  const pemResult = parseSinglePem(pem);
  expect(pemResult.ok).toBe(true);
  if (!pemResult.ok) throw new Error('fixture PEM did not parse');

  const pkiResult = parsePkiDer(pemResult.value.der, 'CERTIFICATE REQUEST');
  expect(pkiResult.ok).toBe(true);
  if (!pkiResult.ok || !(pkiResult.value instanceof CertificationRequest)) {
    throw new Error('fixture CSR did not parse');
  }
  return { request: pkiResult.value, der: pemResult.value.der };
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

describe('mapCertificationRequest', () => {
  test('maps RSA subject, extensionRequest SANs, algorithms, complete-DER fingerprint and valid signature', async () => {
    // Catches DN sorting, reading SAN outside extensionRequest, OID guessing,
    // hashing only CertificationRequestInfo, or dropping the verify result.
    const { request, der } = parseRequest('rsa-csr.pem');

    const report = await mapCertificationRequest(request, der);

    expect(report).toEqual({
      kind: 'csr',
      subject: [
        { oid: '2.5.4.6', name: 'Country', value: 'US' },
        { oid: '2.5.4.10', name: 'Organization', value: 'Daily Tools Lab' },
        { oid: '2.5.4.11', name: 'Organizational Unit', value: 'CSR Fixtures' },
        { oid: '2.5.4.3', name: 'Common Name', value: 'rsa-csr.example.test' },
        { oid: '1.2.840.113549.1.9.1', name: 'Email Address', value: 'pki@example.test' },
      ],
      subjectAlternativeNames: {
        status: 'present',
        values: [
          { type: 'dns', value: 'rsa-csr.example.test' },
          { type: 'ip', value: '192.0.2.77' },
          { type: 'email', value: 'security@example.test' },
          { type: 'uri', value: 'https://rsa-csr.example.test/request' },
        ],
      },
      publicKeyAlgorithm: { oid: '1.2.840.113549.1.1.1', name: 'RSA' },
      signatureAlgorithm: { oid: '1.2.840.113549.1.1.11', name: 'SHA-256 with RSA' },
      fingerprintSha256: '4C:33:14:A0:8D:29:10:FA:BD:2F:44:42:37:A4:F8:ED:81:44:8B:2D:C6:E4:18:E1:BD:A8:70:5E:13:A6:56:F2',
      signature: { status: 'valid' },
    });
  });

  test('maps ECDSA subject, IPv6 SAN, algorithm identifiers and invalid tampered signature', async () => {
    // Catches RSA-only verification, IPv6 formatting mistakes, and mapping a
    // parseable ECDSA signature mutation as unsupported rather than invalid.
    const { request, der } = parseRequest('ecdsa-csr-tampered.pem');

    const report = await mapCertificationRequest(request, der);

    expect(report.subject).toEqual([
      { oid: '2.5.4.6', name: 'Country', value: 'DE' },
      { oid: '2.5.4.10', name: 'Organization', value: 'Daily Tools Lab' },
      { oid: '2.5.4.11', name: 'Organizational Unit', value: 'CSR Fixtures' },
      { oid: '2.5.4.3', name: 'Common Name', value: 'ecdsa-csr.example.test' },
      { oid: '1.2.840.113549.1.9.1', name: 'Email Address', value: 'ec@example.test' },
    ]);
    expect(report.subjectAlternativeNames).toEqual({
      status: 'present',
      values: [
        { type: 'dns', value: 'ecdsa-csr.example.test' },
        { type: 'dns', value: 'alt-ecdsa.example.test' },
        { type: 'ip', value: '2001:db8::42' },
      ],
    });
    expect(report.publicKeyAlgorithm).toEqual({ oid: '1.2.840.10045.2.1', name: 'EC' });
    expect(report.signatureAlgorithm).toEqual({
      oid: '1.2.840.10045.4.3.3',
      name: 'ECDSA with SHA-384',
    });
    expect(report.fingerprintSha256).toBe(
      '28:29:DF:33:29:84:0A:70:64:7F:DA:91:27:A5:52:B2:76:82:87:99:3C:19:77:66:5C:87:96:5E:E5:14:F6:77',
    );
    expect(report.signature).toEqual({ status: 'invalid' });
  });

  test('reports a missing extensionRequest SAN explicitly as 未包含 without failing verification', async () => {
    // Catches treating an absent extensionRequest/SAN as malformed input or
    // silently representing absence as an ambiguous empty array.
    const { request, der } = parseRequest('no-san-csr.pem');

    const report = await mapCertificationRequest(request, der);

    expect(report.subjectAlternativeNames).toEqual({ status: 'absent', label: '未包含' });
    expect(report.signature).toEqual({ status: 'valid' });
    expect(report.fingerprintSha256).toBe(
      'A6:07:24:45:5D:D5:1B:13:1E:05:08:76:2A:17:C5:06:80:BA:B5:FF:40:8B:3D:EC:8E:AF:F7:F1:00:0A:83:5D',
    );
  });

  test('returns a JSON-safe DTO without ASN.1 objects, raw DER, native errors, private material or trust claims', async () => {
    // Catches spreading PKI.js objects into the DTO or turning CSR signature
    // verification into broader certificate/trust assertions.
    const { request, der } = parseRequest('rsa-csr-tampered.pem');

    const report = await mapCertificationRequest(request, der);
    const keys = propertyNames(report);
    const serialized = JSON.stringify(report);

    expectPlainTextDto(report);
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(keys.some(key => /html|error|message/i.test(key))).toBe(false);
    expect(keys).not.toEqual(expect.arrayContaining([
      'der',
      'privateKey',
      'privateMaterial',
      'trust',
      'trusted',
      'identityValid',
      'authorized',
      'issued',
      'hostnameValid',
      'revoked',
      'revocationValid',
    ]));
    expect(serialized).not.toMatch(/BEGIN (?:RSA |EC )?PRIVATE KEY/);
    expect(serialized).not.toContain('<script');
    expect(report).not.toBeInstanceOf(CertificationRequest);
    expect(report).not.toBeInstanceOf(asn1js.BaseBlock);
  });
});
