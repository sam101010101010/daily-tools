import { describe, expect, test } from 'vitest';
import {
  CidrError,
  calculateCidr,
  contains,
  parseCidr,
} from './cidr';

describe('IPv4 CIDR calculation', () => {
  test.each([
    [
      '0.0.0.0/0',
      {
        family: 'ipv4',
        prefix: 0,
        normalizedCidr: '0.0.0.0/0',
        address: '0.0.0.0',
        network: '0.0.0.0',
        first: '0.0.0.0',
        last: '255.255.255.255',
        netmask: '0.0.0.0',
        wildcard: '255.255.255.255',
        broadcast: '255.255.255.255',
        addressCount: '4294967296',
      },
    ],
    [
      '192.168.1.42/24',
      {
        family: 'ipv4',
        prefix: 24,
        normalizedCidr: '192.168.1.42/24',
        address: '192.168.1.42',
        network: '192.168.1.0',
        first: '192.168.1.0',
        last: '192.168.1.255',
        netmask: '255.255.255.0',
        wildcard: '0.0.0.255',
        broadcast: '192.168.1.255',
        addressCount: '256',
      },
    ],
    [
      '192.0.2.1/31',
      {
        family: 'ipv4',
        prefix: 31,
        normalizedCidr: '192.0.2.1/31',
        address: '192.0.2.1',
        network: '192.0.2.0',
        first: '192.0.2.0',
        last: '192.0.2.1',
        netmask: '255.255.255.254',
        wildcard: '0.0.0.1',
        broadcast: '192.0.2.1',
        addressCount: '2',
      },
    ],
    [
      '192.0.2.1/32',
      {
        family: 'ipv4',
        prefix: 32,
        normalizedCidr: '192.0.2.1/32',
        address: '192.0.2.1',
        network: '192.0.2.1',
        first: '192.0.2.1',
        last: '192.0.2.1',
        netmask: '255.255.255.255',
        wildcard: '0.0.0.0',
        broadcast: '192.0.2.1',
        addressCount: '1',
      },
    ],
  ])('calculates exact boundaries for %s', (input, expected) => {
    expect(calculateCidr(parseCidr(input))).toEqual(expected);
  });

  test.each([
    ['0.0.0.0', 0],
    ['255.255.255.0', 24],
    ['255.255.255.255', 32],
  ])(
    'normalizes contiguous dotted mask %s to prefix /%i',
    (mask, prefix) => {
      const cidr = parseCidr(`192.168.1.42/${mask}`);

      expect(cidr.prefix).toBe(prefix);
      expect(cidr.normalized).toBe(`192.168.1.42/${prefix}`);
      expect(calculateCidr(cidr).netmask).toBe(mask);
    },
  );

  test.each(['255.0.255.0', '255.255.255.1'])(
    'rejects non-contiguous dotted mask %s',
    (mask) => {
      expectCidrError(
        () => parseCidr(`192.168.1.42/${mask}`),
        'INVALID_MASK',
      );
    },
  );
});

describe('IPv6 CIDR calculation', () => {
  test.each([
    [
      '2001:db8::1/0',
      {
        prefix: 0,
        network: '::',
        first: '::',
        last: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        netmask: '::',
        addressCount: '340282366920938463463374607431768211456',
      },
    ],
    [
      '2001:db8::1/64',
      {
        prefix: 64,
        network: '2001:db8::',
        first: '2001:db8::',
        last: '2001:db8::ffff:ffff:ffff:ffff',
        netmask: 'ffff:ffff:ffff:ffff::',
        addressCount: '18446744073709551616',
      },
    ],
    [
      '2001:db8::1/127',
      {
        prefix: 127,
        network: '2001:db8::',
        first: '2001:db8::',
        last: '2001:db8::1',
        netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:fffe',
        addressCount: '2',
      },
    ],
    [
      '2001:db8::1/128',
      {
        prefix: 128,
        network: '2001:db8::1',
        first: '2001:db8::1',
        last: '2001:db8::1',
        netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        addressCount: '1',
      },
    ],
  ])('calculates exact boundaries for %s', (input, expected) => {
    expect(calculateCidr(parseCidr(input))).toMatchObject({
      family: 'ipv6',
      normalizedCidr: input,
      address: '2001:db8::1',
      ...expected,
    });
  });

  test('does not expose IPv4-only broadcast or wildcard rows', () => {
    const report = calculateCidr(parseCidr('2001:db8::1/64'));

    expect(report).not.toHaveProperty('broadcast');
    expect(report).not.toHaveProperty('wildcard');
  });

  test('preserves mapped IPv6 notation through CIDR boundaries and membership', () => {
    const cidr = parseCidr('::ffff:192.0.2.1/120');

    expect(calculateCidr(cidr)).toMatchObject({
      family: 'ipv6',
      normalizedCidr: '::ffff:192.0.2.1/120',
      network: '::ffff:192.0.2.0',
      last: '::ffff:192.0.2.255',
    });
    expect(contains(cidr, '::ffff:192.0.2.255')).toBe(true);
    expect(contains(cidr, '::ffff:192.0.3.0')).toBe(false);
  });
});

describe('CIDR validation and membership', () => {
  test.each([
    ['192.168.1.1/33', 'INVALID_PREFIX'],
    ['2001:db8::1/129', 'INVALID_PREFIX'],
    ['192.168.1.1/-1', 'INVALID_PREFIX'],
    ['192.168.1.1/24.5', 'INVALID_PREFIX'],
    ['192.168.1.1/024', 'INVALID_PREFIX'],
    ['2001:db8::1/255.255.255.0', 'INVALID_PREFIX'],
    ['192.168.1.1', 'MISSING_PREFIX'],
    ['192.168.1.1/', 'MISSING_PREFIX'],
    ['/24', 'INVALID_CIDR'],
    ['192.168.1.1/24/1', 'INVALID_CIDR'],
  ])('rejects invalid CIDR %j with code %s', (input, code) => {
    expectCidrError(
      () => parseCidr(input),
      code as CidrError['code'],
    );
  });

  test('checks membership against exact same-family masked values', () => {
    const cidr = parseCidr('192.168.1.42/24');

    expect(contains(cidr, '192.168.1.0')).toBe(true);
    expect(contains(cidr, '192.168.1.255')).toBe(true);
    expect(contains(cidr, '192.168.2.1')).toBe(false);
  });

  test('checks IPv6 membership without Number precision loss', () => {
    const cidr = parseCidr('2001:db8::1/64');

    expect(contains(cidr, '2001:db8::ffff:ffff:ffff:ffff')).toBe(
      true,
    );
    expect(contains(cidr, '2001:db9::1')).toBe(false);
  });

  test('rejects mixed-family membership instead of returning false', () => {
    expectCidrError(
      () => contains(parseCidr('192.168.1.42/24'), '::ffff:c0a8:12a'),
      'MIXED_FAMILY',
    );
  });

  test('returns immutable parsed and calculated DTOs', () => {
    const cidr = parseCidr('192.168.1.42/24');
    const report = calculateCidr(cidr);

    expect(Object.isFrozen(cidr)).toBe(true);
    expect(Object.isFrozen(cidr.address)).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
  });
});

function expectCidrError(
  action: () => unknown,
  code: CidrError['code'],
): void {
  try {
    action();
    throw new Error('Expected CIDR operation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(CidrError);
    expect(error).toMatchObject({ code });
  }
}
