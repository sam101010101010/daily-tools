import * as asn1js from 'asn1js';
import { Certificate, CertificationRequest } from 'pkijs';
import type { PemLabel } from './pem';

export const MAX_ASN1_DEPTH = 100;
export const MAX_ASN1_NODES = 10_000;
export const MAX_ASN1_CONTENT_LENGTH = 1_048_576;

type PkiObject = Certificate | CertificationRequest;

export type Asn1ParseResult =
  | Readonly<{ ok: true; value: PkiObject }>
  | Readonly<{ ok: false; error: Readonly<{ code: 'INVALID_ASN1'; message: string }> }>;

function invalidAsn1(): Asn1ParseResult {
  return { ok: false, error: { code: 'INVALID_ASN1', message: '内容不是受支持的有效 ASN.1 证书或证书请求。' } };
}

type ScanState = { nodes: number };

function readLength(bytes: Uint8Array, offset: number): { length: number; offset: number } | undefined {
  if (offset >= bytes.length) return undefined;
  const first = bytes[offset++];
  if (first < 0x80) return { length: first, offset };

  const count = first & 0x7f;
  if (count === 0 || count > 4 || offset + count > bytes.length) return undefined;
  if (bytes[offset] === 0) return undefined;

  let length = 0;
  for (let index = 0; index < count; index += 1) length = (length * 256) + bytes[offset + index];
  if (length < 0x80 || length > MAX_ASN1_CONTENT_LENGTH) return undefined;
  return { length, offset: offset + count };
}

function scanElement(bytes: Uint8Array, start: number, end: number, depth: number, state: ScanState): number | undefined {
  if (depth > MAX_ASN1_DEPTH || start >= end || state.nodes >= MAX_ASN1_NODES) return undefined;
  state.nodes += 1;

  let offset = start;
  const tag = bytes[offset++];
  if ((tag & 0x1f) === 0x1f) {
    let highTagBytes = 0;
    do {
      if (offset >= end || highTagBytes >= 4) return undefined;
      highTagBytes += 1;
    } while ((bytes[offset++] & 0x80) !== 0);
  }

  const length = readLength(bytes, offset);
  if (!length || length.length > end - length.offset) return undefined;
  const contentEnd = length.offset + length.length;
  if ((tag & 0x20) === 0) return contentEnd;

  let childOffset = length.offset;
  while (childOffset < contentEnd) {
    const nextOffset = scanElement(bytes, childOffset, contentEnd, depth + 1, state);
    if (nextOffset === undefined) return undefined;
    childOffset = nextOffset;
  }
  return childOffset === contentEnd ? contentEnd : undefined;
}

function hasAllowedStructure(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ASN1_CONTENT_LENGTH) return false;
  return scanElement(bytes, 0, bytes.length, 0, { nodes: 0 }) === bytes.length;
}

export function parsePkiDer(der: Uint8Array, label: PemLabel): Asn1ParseResult {
  if (!hasAllowedStructure(der)) return invalidAsn1();

  let schema: asn1js.BaseBlock;
  try {
    const decoded = asn1js.fromBER(new Uint8Array(der).buffer);
    if (decoded.offset !== der.byteLength) return invalidAsn1();
    schema = decoded.result;
  } catch {
    return invalidAsn1();
  }

  try {
    const value = label === 'CERTIFICATE'
      ? new Certificate({ schema })
      : new CertificationRequest({ schema });
    return { ok: true, value };
  } catch {
    return invalidAsn1();
  }
}
