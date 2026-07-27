export type IpFamily = 'ipv4' | 'ipv6';

export type IpParseErrorCode =
  | 'INVALID_IP'
  | 'INVALID_IPV4'
  | 'INVALID_IPV6';

export interface IpAddress {
  readonly family: IpFamily;
  readonly bits: 32 | 128;
  readonly value: bigint;
  readonly canonical: string;
}

export class IpParseError extends Error {
  readonly code: IpParseErrorCode;
  readonly input: string;

  constructor(code: IpParseErrorCode, input: string) {
    super(code);
    this.name = 'IpParseError';
    this.code = code;
    this.input = input;
  }
}

const IPV4_PATTERN =
  /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/;
const IPV4_MAX = 0xffff_ffffn;
const IPV6_MAX = (1n << 128n) - 1n;

export function parseIpAddress(input: string): IpAddress {
  if (input.includes(':')) {
    return parseIpv6(input);
  }
  if (input.includes('.') && !input.includes('/')) {
    return parseIpv4(input);
  }
  throw new IpParseError('INVALID_IP', input);
}

export function parseIpv4(input: string): IpAddress {
  if (!IPV4_PATTERN.test(input)) {
    throw new IpParseError('INVALID_IPV4', input);
  }

  const octets = input.split('.').map(Number);
  if (octets.some((octet) => octet > 255)) {
    throw new IpParseError('INVALID_IPV4', input);
  }

  const value = octets.reduce(
    (result, octet) => (result << 8n) | BigInt(octet),
    0n,
  );

  return {
    family: 'ipv4',
    bits: 32,
    value,
    canonical: formatIpv4(value),
  };
}

export function parseIpv6(input: string): IpAddress {
  const expandedInput = replaceEmbeddedIpv4(input);
  const compressionIndex = expandedInput.indexOf('::');

  if (
    input.length === 0 ||
    input.includes('%') ||
    /\s/.test(input) ||
    (compressionIndex !== -1 &&
      compressionIndex !== expandedInput.lastIndexOf('::'))
  ) {
    throw new IpParseError('INVALID_IPV6', input);
  }

  const groups =
    compressionIndex === -1
      ? parseUncompressedGroups(expandedInput, input)
      : parseCompressedGroups(expandedInput, compressionIndex, input);

  const value = groups.reduce(
    (result, group) => (result << 16n) | BigInt(group),
    0n,
  );

  return {
    family: 'ipv6',
    bits: 128,
    value,
    canonical: formatIpv6(value),
  };
}

export function formatIpv4(value: bigint): string {
  if (value < 0n || value > IPV4_MAX) {
    throw new IpParseError('INVALID_IPV4', value.toString());
  }

  return [24n, 16n, 8n, 0n]
    .map((shift) => ((value >> shift) & 0xffn).toString())
    .join('.');
}

export function formatIpv6(value: bigint): string {
  if (value < 0n || value > IPV6_MAX) {
    throw new IpParseError('INVALID_IPV6', value.toString());
  }

  if (value >> 32n === 0xffffn) {
    return `::ffff:${formatIpv4(value & IPV4_MAX)}`;
  }

  const groups = Array.from({ length: 8 }, (_, index) =>
    Number((value >> BigInt((7 - index) * 16)) & 0xffffn),
  );
  const zeroRun = findLongestZeroRun(groups);
  const textGroups = groups.map((group) => group.toString(16));

  if (zeroRun.start === -1) {
    return textGroups.join(':');
  }

  const before = textGroups.slice(0, zeroRun.start).join(':');
  const after = textGroups
    .slice(zeroRun.start + zeroRun.length)
    .join(':');
  return `${before}::${after}`;
}

function replaceEmbeddedIpv4(input: string): string {
  if (!input.includes('.')) {
    return input;
  }

  const lastColon = input.lastIndexOf(':');
  if (lastColon === -1) {
    throw new IpParseError('INVALID_IPV6', input);
  }

  const ipv4Text = input.slice(lastColon + 1);
  let ipv4: IpAddress;
  try {
    ipv4 = parseIpv4(ipv4Text);
  } catch {
    throw new IpParseError('INVALID_IPV6', input);
  }

  const highGroup = ((ipv4.value >> 16n) & 0xffffn).toString(16);
  const lowGroup = (ipv4.value & 0xffffn).toString(16);
  return `${input.slice(0, lastColon)}:${highGroup}:${lowGroup}`;
}

function parseUncompressedGroups(
  input: string,
  originalInput: string,
): number[] {
  const groups = input.split(':');
  if (groups.length !== 8 || groups.some((group) => group.length === 0)) {
    throw new IpParseError('INVALID_IPV6', originalInput);
  }
  return groups.map((group) => parseIpv6Group(group, originalInput));
}

function parseCompressedGroups(
  input: string,
  compressionIndex: number,
  originalInput: string,
): number[] {
  const leftText = input.slice(0, compressionIndex);
  const rightText = input.slice(compressionIndex + 2);
  const left = leftText.length === 0 ? [] : leftText.split(':');
  const right = rightText.length === 0 ? [] : rightText.split(':');

  if (
    left.some((group) => group.length === 0) ||
    right.some((group) => group.length === 0) ||
    left.length + right.length >= 8
  ) {
    throw new IpParseError('INVALID_IPV6', originalInput);
  }

  const zeroCount = 8 - left.length - right.length;
  return [
    ...left.map((group) => parseIpv6Group(group, originalInput)),
    ...Array<number>(zeroCount).fill(0),
    ...right.map((group) => parseIpv6Group(group, originalInput)),
  ];
}

function parseIpv6Group(group: string, originalInput: string): number {
  if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
    throw new IpParseError('INVALID_IPV6', originalInput);
  }
  return Number.parseInt(group, 16);
}

function findLongestZeroRun(groups: number[]): {
  start: number;
  length: number;
} {
  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;

  for (let index = 0; index <= groups.length; index += 1) {
    if (groups[index] === 0) {
      if (currentStart === -1) {
        currentStart = index;
      }
      continue;
    }

    const currentLength =
      currentStart === -1 ? 0 : index - currentStart;
    if (currentLength >= 2 && currentLength > bestLength) {
      bestStart = currentStart;
      bestLength = currentLength;
    }
    currentStart = -1;
  }

  return { start: bestStart, length: bestLength };
}
