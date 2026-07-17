export interface CertDetail {
  subjectCN: string | null;
  subjectO: string | null;
  issuerCN: string | null;
  issuerO: string | null;
  subjectDN: string;
  issuerDN: string;
  notBefore: string;
  notAfter: string;
  expired: boolean;
  daysUntilExpiry: number;
  keyAlgorithm: string;
  keySize: number | null;
  signatureAlgorithm: string;
  weakSignature: boolean;
  sha256Fingerprint: string;
  serialNumber: string;
  sans: string[];
  pem: string | null;
}

export interface ProtocolResult {
  protocol: string;
  supported: boolean;
  weak: boolean;
}

export interface Validation {
  trusted: boolean;
  trustError: string | null;
  hostnameMatch: boolean;
  matchedName: string | null;
  selfSigned: boolean;
  expired: boolean;
  daysUntilExpiry: number;
}

export interface Negotiated {
  version: string;
  cipher: string;
}

export interface SslReport {
  host: string;
  port: number;
  startTls: string;
  negotiated: Negotiated;
  supportedProtocols: ProtocolResult[];
  validation: Validation;
  chain: CertDetail[];
}
