import { CertificationRequest } from 'pkijs';
import { parsePkiDer } from './asn1';
import { verifyCsrSignature, type CsrSignatureVerification } from './csrVerify';
import { parseSinglePem } from './pem';

const BROWSER_FIXTURES = [
  'rsa-csr.pem',
  'rsa-csr-tampered.pem',
  'ecdsa-csr.pem',
  'ecdsa-csr-tampered.pem',
] as const;

type BrowserFixture = typeof BROWSER_FIXTURES[number];

export type CsrBrowserVerificationResult = Readonly<{
  fixture: BrowserFixture;
  status: CsrSignatureVerification['status'];
}>;

type LoadFixture = (filename: BrowserFixture) => Promise<string>;

export async function runCsrBrowserVerification(
  load: LoadFixture,
): Promise<readonly CsrBrowserVerificationResult[]> {
  return Promise.all(BROWSER_FIXTURES.map(async fixture => {
    const pemResult = parseSinglePem(await load(fixture));
    if (!pemResult.ok) throw new Error('Browser fixture PEM could not be parsed');

    const pkiResult = parsePkiDer(pemResult.value.der, pemResult.value.label);
    if (!pkiResult.ok || !(pkiResult.value instanceof CertificationRequest)) {
      throw new Error('Browser fixture CSR could not be parsed');
    }

    const verification = await verifyCsrSignature(pkiResult.value);
    return { fixture, status: verification.status };
  }));
}
