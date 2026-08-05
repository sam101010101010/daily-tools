import {
  assertExpectedBrowserVerification,
  runCsrBrowserVerification,
} from './csrVerify.browser';
import ecdsaCsrPem from './fixtures/ecdsa-csr.pem?raw';
import ecdsaCsrTamperedPem from './fixtures/ecdsa-csr-tampered.pem?raw';
import rsaCsrPem from './fixtures/rsa-csr.pem?raw';
import rsaCsrTamperedPem from './fixtures/rsa-csr-tampered.pem?raw';

const fixtures = {
  'rsa-csr.pem': rsaCsrPem,
  'rsa-csr-tampered.pem': rsaCsrTamperedPem,
  'ecdsa-csr.pem': ecdsaCsrPem,
  'ecdsa-csr-tampered.pem': ecdsaCsrTamperedPem,
} as const;

const output = document.querySelector<HTMLOutputElement>('#csr-results');

void runCsrBrowserVerification(async filename => fixtures[filename])
  .then(results => {
    assertExpectedBrowserVerification(results);
    if (!output) return;
    output.dataset.result = 'pass';
    output.textContent = JSON.stringify(results);
    document.title = 'CSR browser verification: pass';
  })
  .catch(() => {
    if (!output) return;
    output.dataset.result = 'fail';
    output.textContent = 'Browser verification harness failed';
    document.title = 'CSR browser verification: fail';
  });
