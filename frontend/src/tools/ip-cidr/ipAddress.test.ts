import { describe, expect, test } from 'vitest';
import {
  IpParseError,
  formatIpv4,
  formatIpv6,
  parseIpAddress,
  parseIpv4,
  parseIpv6,
} from './ipAddress';

describe('IPv4 parsing', () => {
  test.each([
    ['0.0.0.0', 0n],
    ['192.168.1.42', 0xc0a8_012an],
    ['255.255.255.255', 0xffff_ffffn],
  ])('parses %s as a 32-bit unsigned value', (input, value) => {
    expect(parseIpAddress(input)).toEqual({
      family: 'ipv4',
      bits: 32,
      value,
      canonical: input,
    });
  });

  test('rejects ambiguous decimal octets with leading zeroes', () => {
    expectParseError(() => parseIpv4('192.168.001.1'), 'INVALID_IPV4');
  });

  test.each([
    ' 192.168.1.1',
    '192.168.1.1 ',
    '+192.168.1.1',
    '-1.2.3.4',
    '127.1',
    '1.2.3',
    '1.2.3.4.5',
    '256.0.0.1',
    '1.2.3.-4',
    '1.2.3.a',
  ])('rejects invalid IPv4 input %j with a stable code', (input) => {
    expectParseError(() => parseIpv4(input), 'INVALID_IPV4');
  });

  test('formats the complete unsigned IPv4 range', () => {
    expect(formatIpv4(0n)).toBe('0.0.0.0');
    expect(formatIpv4(0xffff_ffffn)).toBe('255.255.255.255');
  });
});

describe('IPv6 parsing and RFC 5952 formatting', () => {
  test.each([
    ['::', 0n, '::'],
    [
      '2001:0db8:0:0:0:0:2:1',
      0x2001_0db8_0000_0000_0000_0000_0002_0001n,
      '2001:db8::2:1',
    ],
    [
      '2001:0:0:1:0:0:1:1',
      0x2001_0000_0000_0001_0000_0000_0001_0001n,
      '2001::1:0:0:1:1',
    ],
    [
      '2001:db8:0:1:1:1:1:1',
      0x2001_0db8_0000_0001_0001_0001_0001_0001n,
      '2001:db8:0:1:1:1:1:1',
    ],
    [
      '2001:db8::192.0.2.33',
      0x2001_0db8_0000_0000_0000_0000_c000_0221n,
      '2001:db8::c000:221',
    ],
    [
      '::ffff:192.0.2.128',
      0x0000_0000_0000_0000_0000_ffff_c000_0280n,
      '::ffff:192.0.2.128',
    ],
    [
      '2001:DB8::0001',
      0x2001_0db8_0000_0000_0000_0000_0000_0001n,
      '2001:db8::1',
    ],
    [
      'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      0xffff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn,
      'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    ],
    [
      '1:2:3:4:5:6:7::',
      0x0001_0002_0003_0004_0005_0006_0007_0000n,
      '1:2:3:4:5:6:7:0',
    ],
  ])('parses %s without losing its IPv6 identity', (input, value, canonical) => {
    expect(parseIpAddress(input)).toEqual({
      family: 'ipv6',
      bits: 128,
      value,
      canonical,
    });
  });

  test.each([
    ' ::1',
    '::1 ',
    '1::2::3',
    '1:2:3:4:5:6:7:8:9',
    '1:2:3:4:5:6:7',
    'gggg::1',
    '12345::1',
    'fe80::1%en0',
    '::ffff:192.0.2.999',
    '192.0.2.1::',
  ])('rejects invalid IPv6 input %j with a stable code', (input) => {
    expectParseError(() => parseIpv6(input), 'INVALID_IPV6');
  });

  test('formats the leftmost longest zero run and never compresses one group', () => {
    expect(formatIpv6(0x2001_0000_0000_0001_0000_0000_0001_0001n)).toBe(
      '2001::1:0:0:1:1',
    );
    expect(formatIpv6(0x2001_0db8_0000_0001_0001_0001_0001_0001n)).toBe(
      '2001:db8:0:1:1:1:1:1',
    );
  });
});

describe('address-family detection', () => {
  test.each(['', 'localhost', '1.2.3.4/24'])(
    'rejects non-address input %j with a stable local code',
    (input) => {
      expectParseError(() => parseIpAddress(input), 'INVALID_IP');
    },
  );
});

function expectParseError(
  action: () => unknown,
  code: IpParseError['code'],
): void {
  try {
    action();
    throw new Error('Expected parsing to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(IpParseError);
    expect(error).toMatchObject({ code });
  }
}
