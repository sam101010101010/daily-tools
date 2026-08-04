/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { runCsrBrowserVerification } from './csrVerify.browser';

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
