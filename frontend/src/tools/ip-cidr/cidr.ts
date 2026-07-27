import {
  formatIpv4,
  formatIpv6,
  parseIpAddress,
  parseIpv4,
} from './ipAddress';
import type { IpAddress, IpFamily } from './ipAddress';

export type CidrErrorCode =
  | 'INVALID_CIDR'
  | 'MISSING_PREFIX'
  | 'INVALID_PREFIX'
  | 'INVALID_MASK'
  | 'MIXED_FAMILY';

export class CidrError extends Error {
  readonly code: CidrErrorCode;
  readonly input: string;

  constructor(code: CidrErrorCode, input: string) {
    super(code);
    this.name = 'CidrError';
    this.code = code;
    this.input = input;
  }
}

export interface ParsedCidr {
  readonly address: Readonly<IpAddress>;
  readonly prefix: number;
  readonly normalized: string;
}

export interface CidrReport {
  readonly family: IpFamily;
  readonly prefix: number;
  readonly normalizedCidr: string;
  readonly address: string;
  readonly network: string;
  readonly first: string;
  readonly last: string;
  readonly netmask: string;
  readonly addressCount: string;
  readonly wildcard?: string;
  readonly broadcast?: string;
}

const IPV4_MAX = 0xffff_ffffn;

export function parseCidr(input: string): Readonly<ParsedCidr> {
  const firstSlash = input.indexOf('/');
  if (firstSlash === -1) {
    throw new CidrError('MISSING_PREFIX', input);
  }
  if (firstSlash !== input.lastIndexOf('/')) {
    throw new CidrError('INVALID_CIDR', input);
  }

  const addressText = input.slice(0, firstSlash);
  const prefixText = input.slice(firstSlash + 1);
  if (addressText.length === 0) {
    throw new CidrError('INVALID_CIDR', input);
  }
  if (prefixText.length === 0) {
    throw new CidrError('MISSING_PREFIX', input);
  }

  const address = Object.freeze(parseIpAddress(addressText));
  const prefix = parsePrefix(prefixText, address, input);

  return Object.freeze({
    address,
    prefix,
    normalized: `${address.canonical}/${prefix}`,
  });
}

export function calculateCidr(cidr: ParsedCidr): Readonly<CidrReport> {
  const hostBits = cidr.address.bits - cidr.prefix;
  const { allOnes, mask } = createMask(
    cidr.address.bits,
    cidr.prefix,
  );
  const hostMask = allOnes ^ mask;
  const network = cidr.address.value & mask;
  const last = network | hostMask;
  const format =
    cidr.address.family === 'ipv4' ? formatIpv4 : formatIpv6;

  const common = {
    family: cidr.address.family,
    prefix: cidr.prefix,
    normalizedCidr: cidr.normalized,
    address: cidr.address.canonical,
    network: format(network),
    first: format(network),
    last: format(last),
    netmask: format(mask),
    addressCount: (2n ** BigInt(hostBits)).toString(),
  };

  if (cidr.address.family === 'ipv4') {
    return Object.freeze({
      ...common,
      wildcard: formatIpv4(hostMask),
      broadcast: formatIpv4(last),
    });
  }
  return Object.freeze(common);
}

export function contains(cidr: ParsedCidr, candidateInput: string): boolean {
  const candidate = parseIpAddress(candidateInput);
  if (candidate.family !== cidr.address.family) {
    throw new CidrError('MIXED_FAMILY', candidateInput);
  }

  const { mask } = createMask(cidr.address.bits, cidr.prefix);
  return (candidate.value & mask) === (cidr.address.value & mask);
}

function createMask(
  bits: 32 | 128,
  prefix: number,
): { allOnes: bigint; mask: bigint } {
  const allOnes = (1n << BigInt(bits)) - 1n;
  const hostBits = bits - prefix;
  const mask =
    prefix === 0 ? 0n : (allOnes << BigInt(hostBits)) & allOnes;
  return { allOnes, mask };
}

function parsePrefix(
  input: string,
  address: IpAddress,
  cidrInput: string,
): number {
  const dotCount = input.split('.').length - 1;
  if (dotCount === 3) {
    if (address.family !== 'ipv4') {
      throw new CidrError('INVALID_PREFIX', cidrInput);
    }
    return dottedMaskToPrefix(input, cidrInput);
  }
  if (dotCount > 0) {
    throw new CidrError('INVALID_PREFIX', cidrInput);
  }

  if (!/^(?:0|[1-9]\d*)$/.test(input)) {
    throw new CidrError('INVALID_PREFIX', cidrInput);
  }

  const prefix = Number(input);
  if (!Number.isSafeInteger(prefix) || prefix > address.bits) {
    throw new CidrError('INVALID_PREFIX', cidrInput);
  }
  return prefix;
}

function dottedMaskToPrefix(input: string, cidrInput: string): number {
  let mask: bigint;
  try {
    mask = parseIpv4(input).value;
  } catch {
    throw new CidrError('INVALID_MASK', cidrInput);
  }

  const wildcard = IPV4_MAX ^ mask;
  if ((wildcard & (wildcard + 1n)) !== 0n) {
    throw new CidrError('INVALID_MASK', cidrInput);
  }

  let prefix = 0;
  for (let bit = 31n; bit >= 0n; bit -= 1n) {
    if ((mask & (1n << bit)) === 0n) {
      break;
    }
    prefix += 1;
  }
  return prefix;
}
