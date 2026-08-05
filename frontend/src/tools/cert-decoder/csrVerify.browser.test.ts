/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  assertExpectedBrowserVerification,
  runCsrBrowserVerification,
  type CsrBrowserVerificationResult,
} from './csrVerify.browser';

const FIXTURE_DIRECTORY = resolve(process.cwd(), 'src/tools/cert-decoder/fixtures');

test('browser harness verifies both RSA and ECDSA valid/tampered fixture pairs', async () => {
  // Catches a browser harness that omits one algorithm/tamper case or reports
  // anything other than the stable observable verification statuses.
  const results = await runCsrBrowserVerification(async filename =>
    readFileSync(resolve(FIXTURE_DIRECTORY, filename), 'utf8'));

  expect(results).toEqual([
    { fixture: 'rsa-csr.pem', status: 'valid' },
    { fixture: 'rsa-csr-tampered.pem', status: 'invalid' },
    { fixture: 'ecdsa-csr.pem', status: 'valid' },
    { fixture: 'ecdsa-csr-tampered.pem', status: 'invalid' },
  ]);
});

test('browser pass decision accepts only the exact expected vector', () => {
  const results = [
    { fixture: 'rsa-csr.pem', status: 'valid' },
    { fixture: 'rsa-csr-tampered.pem', status: 'invalid' },
    { fixture: 'ecdsa-csr.pem', status: 'valid' },
    { fixture: 'ecdsa-csr-tampered.pem', status: 'invalid' },
  ] satisfies readonly CsrBrowserVerificationResult[];

  expect(() => assertExpectedBrowserVerification(results)).not.toThrow();
});

test.each([
  {
    name: 'all algorithms unsupported',
    results: [
      { fixture: 'rsa-csr.pem', status: 'unsupported' },
      { fixture: 'rsa-csr-tampered.pem', status: 'unsupported' },
      { fixture: 'ecdsa-csr.pem', status: 'unsupported' },
      { fixture: 'ecdsa-csr-tampered.pem', status: 'unsupported' },
    ],
  },
  {
    name: 'one incorrect status',
    results: [
      { fixture: 'rsa-csr.pem', status: 'valid' },
      { fixture: 'rsa-csr-tampered.pem', status: 'invalid' },
      { fixture: 'ecdsa-csr.pem', status: 'valid' },
      { fixture: 'ecdsa-csr-tampered.pem', status: 'valid' },
    ],
  },
  {
    name: 'missing result',
    results: [
      { fixture: 'rsa-csr.pem', status: 'valid' },
      { fixture: 'rsa-csr-tampered.pem', status: 'invalid' },
      { fixture: 'ecdsa-csr.pem', status: 'valid' },
    ],
  },
  {
    name: 'reordered result',
    results: [
      { fixture: 'rsa-csr-tampered.pem', status: 'invalid' },
      { fixture: 'rsa-csr.pem', status: 'valid' },
      { fixture: 'ecdsa-csr.pem', status: 'valid' },
      { fixture: 'ecdsa-csr-tampered.pem', status: 'invalid' },
    ],
  },
] satisfies readonly {
  name: string;
  results: readonly CsrBrowserVerificationResult[];
}[])('browser pass decision rejects $name', ({ results }) => {
  // Catches the browser entry treating mere promise resolution as success;
  // every fixture and status must match the acceptance vector exactly.
  expect(() => assertExpectedBrowserVerification(results)).toThrowError(
    'Browser verification results did not match the expected vector',
  );
});
