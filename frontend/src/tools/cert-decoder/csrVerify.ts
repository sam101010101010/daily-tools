import type { CertificationRequest } from 'pkijs';

export type CsrSignatureVerification =
  | Readonly<{ status: 'valid' }>
  | Readonly<{ status: 'invalid' }>
  | Readonly<{ status: 'unsupported' }>;

export type CsrVerificationOperation = (
  request: CertificationRequest,
) => Promise<boolean>;

const verifyWithPkijs: CsrVerificationOperation = request => request.verify();

export async function verifyCsrSignature(
  request: CertificationRequest,
  operation: CsrVerificationOperation = verifyWithPkijs,
): Promise<CsrSignatureVerification> {
  try {
    return await operation(request)
      ? { status: 'valid' }
      : { status: 'invalid' };
  } catch {
    return { status: 'unsupported' };
  }
}
