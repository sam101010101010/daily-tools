import * as asn1js from 'asn1js';
import {
  AltName,
  BasicConstraints,
  ExtKeyUsage,
  type Certificate,
  type Extension,
  type GeneralName,
  type RelativeDistinguishedNames,
} from 'pkijs';

export type CertificateValidityState = 'not-yet-valid' | 'valid' | 'expired';

export type DistinguishedNameItem = Readonly<{
  oid: string;
  name: string;
  value: string;
}>;

export type SubjectAlternativeName =
  | Readonly<{ type: 'dns' | 'email' | 'uri'; value: string }>
  | Readonly<{ type: 'ip'; value: string }>
  | Readonly<{ type: 'unknown'; tag: number; value: string }>;

export type AlgorithmReport = Readonly<{
  oid: string;
  name: string;
}>;

export type BasicConstraintsReport = Readonly<{
  oid: '2.5.29.19';
  critical: boolean;
  ca: boolean;
  pathLength: number | null;
}>;

export type KeyUsageName =
  | 'digital-signature'
  | 'content-commitment'
  | 'key-encipherment'
  | 'data-encipherment'
  | 'key-agreement'
  | 'key-cert-sign'
  | 'crl-sign'
  | 'encipher-only'
  | 'decipher-only';

export type KeyUsageReport = Readonly<{
  oid: '2.5.29.15';
  critical: boolean;
  usages: readonly KeyUsageName[];
}>;

export type ExtendedKeyUsageReport = Readonly<{
  oid: '2.5.29.37';
  critical: boolean;
  purposes: readonly AlgorithmReport[];
}>;

export type UnrecognizedExtensionReport = Readonly<{
  oid: string;
  critical: boolean;
  value: string;
}>;

export type CertificateReport = Readonly<{
  kind: 'certificate';
  version: number;
  serialNumber: string;
  subject: readonly DistinguishedNameItem[];
  issuer: readonly DistinguishedNameItem[];
  validity: Readonly<{
    notBefore: string;
    notAfter: string;
    state: CertificateValidityState;
  }>;
  signatureAlgorithm: AlgorithmReport;
  publicKeyAlgorithm: AlgorithmReport;
  fingerprintSha256: string;
  subjectAlternativeNames: readonly SubjectAlternativeName[];
  extensions: Readonly<{
    basicConstraints: BasicConstraintsReport | null;
    keyUsage: KeyUsageReport | null;
    extendedKeyUsage: ExtendedKeyUsageReport | null;
    unrecognized: readonly UnrecognizedExtensionReport[];
  }>;
}>;

const DN_NAMES: Readonly<Record<string, string>> = {
  '2.5.4.3': 'Common Name',
  '2.5.4.4': 'Surname',
  '2.5.4.5': 'Serial Number',
  '2.5.4.6': 'Country',
  '2.5.4.7': 'Locality',
  '2.5.4.8': 'State or Province',
  '2.5.4.9': 'Street Address',
  '2.5.4.10': 'Organization',
  '2.5.4.11': 'Organizational Unit',
  '2.5.4.12': 'Title',
  '2.5.4.42': 'Given Name',
  '1.2.840.113549.1.9.1': 'Email Address',
};

const SIGNATURE_ALGORITHM_NAMES: Readonly<Record<string, string>> = {
  '1.2.840.113549.1.1.5': 'SHA-1 with RSA',
  '1.2.840.113549.1.1.10': 'RSA-PSS',
  '1.2.840.113549.1.1.11': 'SHA-256 with RSA',
  '1.2.840.113549.1.1.12': 'SHA-384 with RSA',
  '1.2.840.113549.1.1.13': 'SHA-512 with RSA',
  '1.2.840.10045.4.3.2': 'ECDSA with SHA-256',
  '1.2.840.10045.4.3.3': 'ECDSA with SHA-384',
  '1.2.840.10045.4.3.4': 'ECDSA with SHA-512',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

const PUBLIC_KEY_ALGORITHM_NAMES: Readonly<Record<string, string>> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.10045.2.1': 'EC',
  '1.3.101.110': 'X25519',
  '1.3.101.111': 'X448',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

const EXTENDED_KEY_USAGE_NAMES: Readonly<Record<string, string>> = {
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'Email Protection',
  '1.3.6.1.5.5.7.3.8': 'Time Stamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
};

const RECOGNIZED_EXTENSION_OIDS = new Set([
  '2.5.29.14', // Subject Key Identifier
  '2.5.29.15', // Key Usage
  '2.5.29.17', // Subject Alternative Name
  '2.5.29.18', // Issuer Alternative Name
  '2.5.29.19', // Basic Constraints
  '2.5.29.20', // CRL Number
  '2.5.29.21', // CRL Reason
  '2.5.29.24', // Invalidity Date
  '2.5.29.27', // Delta CRL Indicator
  '2.5.29.28', // Issuing Distribution Point
  '2.5.29.29', // Certificate Issuer
  '2.5.29.30', // Name Constraints
  '2.5.29.31', // CRL Distribution Points
  '2.5.29.32', // Certificate Policies
  '2.5.29.33', // Policy Mappings
  '2.5.29.35', // Authority Key Identifier
  '2.5.29.36', // Policy Constraints
  '2.5.29.37', // Extended Key Usage
  '2.5.29.46', // Freshest CRL
  '2.5.29.54', // Inhibit Any Policy
  '1.3.6.1.5.5.7.1.1', // Authority Information Access
  '1.3.6.1.5.5.7.1.11', // Subject Information Access
]);

const KEY_USAGE_BITS: readonly KeyUsageName[] = [
  'digital-signature',
  'content-commitment',
  'key-encipherment',
  'data-encipherment',
  'key-agreement',
  'key-cert-sign',
  'crl-sign',
  'encipher-only',
  'decipher-only',
];

function bytesToHex(bytes: Uint8Array, separator = ':'): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(separator);
}

function asn1TextValue(value: asn1js.BaseBlock): string {
  const valueBlock = value.valueBlock as unknown as { value?: unknown };
  return typeof valueBlock.value === 'string'
    ? valueBlock.value
    : bytesToHex(new Uint8Array(value.toBER(false)));
}

function mapDistinguishedName(name: RelativeDistinguishedNames): DistinguishedNameItem[] {
  return name.typesAndValues.map(item => ({
    oid: item.type,
    name: DN_NAMES[item.type] ?? 'unknown',
    value: asn1TextValue(item.value),
  }));
}

function mapAlgorithm(oid: string, names: Readonly<Record<string, string>>): AlgorithmReport {
  return { oid, name: names[oid] ?? 'unknown' };
}

function formatIpAddress(bytes: Uint8Array): string {
  if (bytes.length === 4) return Array.from(bytes).join('.');
  if (bytes.length !== 16) return bytesToHex(bytes);

  const groups = Array.from({ length: 8 }, (_, index) =>
    ((bytes[index * 2] << 8) | bytes[(index * 2) + 1]).toString(16));
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < groups.length;) {
    if (groups[start] !== '0') {
      start += 1;
      continue;
    }
    let end = start;
    while (end < groups.length && groups[end] === '0') end += 1;
    if (end - start > bestLength && end - start > 1) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }
  if (bestStart === -1) return groups.join(':');
  const left = groups.slice(0, bestStart).join(':');
  const right = groups.slice(bestStart + bestLength).join(':');
  return `${left}::${right}`;
}

function unknownGeneralNameValue(name: GeneralName): string {
  const value = name.value as unknown as { toBER?: (encodeFlag?: boolean) => ArrayBuffer };
  return typeof value.toBER === 'function'
    ? bytesToHex(new Uint8Array(value.toBER(false)))
    : String(name.value);
}

function mapGeneralName(name: GeneralName): SubjectAlternativeName {
  if (name.type === 1) return { type: 'email', value: String(name.value) };
  if (name.type === 2) return { type: 'dns', value: String(name.value) };
  if (name.type === 6) return { type: 'uri', value: String(name.value) };
  if (name.type === 7 && name.value instanceof asn1js.OctetString) {
    return { type: 'ip', value: formatIpAddress(name.value.valueBlock.valueHexView) };
  }
  return { type: 'unknown', tag: name.type, value: unknownGeneralNameValue(name) };
}

function findExtension(extensions: readonly Extension[], oid: string): Extension | undefined {
  return extensions.find(extension => extension.extnID === oid);
}

function mapSubjectAlternativeNames(extensions: readonly Extension[]): SubjectAlternativeName[] {
  const extension = findExtension(extensions, '2.5.29.17');
  return extension?.parsedValue instanceof AltName
    ? extension.parsedValue.altNames.map(mapGeneralName)
    : [];
}

function mapBasicConstraints(extensions: readonly Extension[]): BasicConstraintsReport | null {
  const extension = findExtension(extensions, '2.5.29.19');
  if (!extension || !(extension.parsedValue instanceof BasicConstraints)) return null;
  const pathLength = extension.parsedValue.pathLenConstraint;
  return {
    oid: '2.5.29.19',
    critical: extension.critical,
    ca: extension.parsedValue.cA,
    pathLength: typeof pathLength === 'number' ? pathLength : pathLength?.valueBlock.valueDec ?? null,
  };
}

function mapKeyUsage(extensions: readonly Extension[]): KeyUsageReport | null {
  const extension = findExtension(extensions, '2.5.29.15');
  if (!extension || !(extension.parsedValue instanceof asn1js.BitString)) return null;
  const bytes = extension.parsedValue.valueBlock.valueHexView;
  const usages = KEY_USAGE_BITS.filter((_name, bit) =>
    (bytes[Math.floor(bit / 8)] & (0x80 >> (bit % 8))) !== 0);
  return { oid: '2.5.29.15', critical: extension.critical, usages };
}

function mapExtendedKeyUsage(extensions: readonly Extension[]): ExtendedKeyUsageReport | null {
  const extension = findExtension(extensions, '2.5.29.37');
  if (!extension || !(extension.parsedValue instanceof ExtKeyUsage)) return null;
  return {
    oid: '2.5.29.37',
    critical: extension.critical,
    purposes: extension.parsedValue.keyPurposes.map(oid =>
      mapAlgorithm(oid, EXTENDED_KEY_USAGE_NAMES)),
  };
}

function mapUnrecognizedExtensions(extensions: readonly Extension[]): UnrecognizedExtensionReport[] {
  return extensions
    .filter(extension => !RECOGNIZED_EXTENSION_OIDS.has(extension.extnID))
    .map(extension => ({
      oid: extension.extnID,
      critical: extension.critical,
      value: bytesToHex(extension.extnValue.valueBlock.valueHexView),
    }));
}

function validityState(notBefore: Date, notAfter: Date, now: Date): CertificateValidityState {
  if (now.getTime() < notBefore.getTime()) return 'not-yet-valid';
  if (now.getTime() > notAfter.getTime()) return 'expired';
  return 'valid';
}

export async function mapCertificate(
  certificate: Certificate,
  der: Uint8Array,
  now: Date,
): Promise<CertificateReport> {
  const extensions = certificate.extensions ?? [];
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(der).buffer);

  return {
    kind: 'certificate',
    version: certificate.version + 1,
    serialNumber: bytesToHex(certificate.serialNumber.valueBlock.valueHexView, ''),
    subject: mapDistinguishedName(certificate.subject),
    issuer: mapDistinguishedName(certificate.issuer),
    validity: {
      notBefore: certificate.notBefore.value.toISOString(),
      notAfter: certificate.notAfter.value.toISOString(),
      state: validityState(certificate.notBefore.value, certificate.notAfter.value, now),
    },
    signatureAlgorithm: mapAlgorithm(
      certificate.signatureAlgorithm.algorithmId,
      SIGNATURE_ALGORITHM_NAMES,
    ),
    publicKeyAlgorithm: mapAlgorithm(
      certificate.subjectPublicKeyInfo.algorithm.algorithmId,
      PUBLIC_KEY_ALGORITHM_NAMES,
    ),
    fingerprintSha256: bytesToHex(new Uint8Array(digest)),
    subjectAlternativeNames: mapSubjectAlternativeNames(extensions),
    extensions: {
      basicConstraints: mapBasicConstraints(extensions),
      keyUsage: mapKeyUsage(extensions),
      extendedKeyUsage: mapExtendedKeyUsage(extensions),
      unrecognized: mapUnrecognizedExtensions(extensions),
    },
  };
}
