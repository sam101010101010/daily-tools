/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CertificationRequest } from 'pkijs';
import { describe, expect, test } from 'vitest';
import { parsePkiDer } from './asn1';
import { parseSinglePem } from './pem';
import { verifyCsrSignature } from './csrVerify';

const FIXTURE_DIRECTORY = resolve(process.cwd(), 'src/tools/cert-decoder/fixtures');

function parseRequest(filename: string): CertificationRequest {
  const pem = readFileSync(resolve(FIXTURE_DIRECTORY, filename), 'utf8');
  const pemResult = parseSinglePem(pem);
  expect(pemResult.ok).toBe(true);
  if (!pemResult.ok) throw new Error('fixture PEM did not parse');

  const pkiResult = parsePkiDer(pemResult.value.der, 'CERTIFICATE REQUEST');
  expect(pkiResult.ok).toBe(true);
  if (!pkiResult.ok || !(pkiResult.value instanceof CertificationRequest)) {
    throw new Error('fixture CSR did not parse');
  }
  return pkiResult.value;
}

describe('verifyCsrSignature', () => {
  test.each([
    ['RSA', 'rsa-csr.pem'],
    ['ECDSA', 'ecdsa-csr.pem'],
  ])('maps a valid %s PKI.js verification result exactly', async (_algorithm, filename) => {
    // Catches treating a successful Web Crypto verification as an inferred
    // trust, identity, issuance or hostname verdict instead of signature-only.
    const result = await verifyCsrSignature(parseRequest(filename));

    expect(result).toEqual({ status: 'valid' });
  });

  test.each([
    ['RSA', 'rsa-csr-tampered.pem'],
    ['ECDSA', 'ecdsa-csr-tampered.pem'],
  ])('maps a structurally valid but tampered %s request to invalid', async (_algorithm, filename) => {
    // Catches converting PKI.js verify() false into unsupported or accepting a
    // parseable request whose signature was deterministically changed.
    const result = await verifyCsrSignature(parseRequest(filename));

    expect(result).toEqual({ status: 'invalid' });
  });

  test('normalizes a browser algorithm rejection without exposing native details', async () => {
    // Catches collapsing unsupported browser/algorithm behavior into invalid,
    // or copying native DOMException names/messages into the stable result.
    const request = parseRequest('rsa-csr.pem');
    const result = await verifyCsrSignature(request, async () => {
      throw new DOMException('native key import detail must stay private', 'NotSupportedError');
    });

    expect(result).toEqual({ status: 'unsupported' });
    expect(JSON.stringify(result)).not.toContain('NotSupportedError');
    expect(JSON.stringify(result)).not.toContain('native key import detail');
  });
});
