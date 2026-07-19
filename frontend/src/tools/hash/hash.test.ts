import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HASH_ALGORITHM,
  HASH_ALGORITHMS,
  formatBytes,
  normalizeExpectedChecksum,
} from './hash';
import type { HashAlgorithm, HashProgress, HashSource, HashSuccess } from './hash';

describe('hash domain contract', () => {
  it('exposes the approved algorithms with SHA-256 as the default', () => {
    const algorithms: HashAlgorithm[] = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];

    expect(HASH_ALGORITHMS.map(({ id }) => id)).toEqual(algorithms);
    expect(DEFAULT_HASH_ALGORITHM).toBe('sha256');
    expect(HASH_ALGORITHMS).toEqual([
      { id: 'md5', label: 'MD5（兼容）', digestLength: 32, legacy: true },
      { id: 'sha1', label: 'SHA-1（兼容）', digestLength: 40, legacy: true },
      { id: 'sha256', label: 'SHA-256', digestLength: 64, legacy: false },
      { id: 'sha384', label: 'SHA-384', digestLength: 96, legacy: false },
      { id: 'sha512', label: 'SHA-512', digestLength: 128, legacy: false },
    ]);
  });

  it('formats byte counts for display', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1_048_576)).toBe('1.0 MiB');
  });

  it('normalizes only surrounding whitespace and letter case', () => {
    expect(normalizeExpectedChecksum(`  ${'A'.repeat(32)}  `, 'md5')).toEqual({
      ok: true,
      value: 'a'.repeat(32),
    });
    expect(normalizeExpectedChecksum('a1 b2', 'md5')).toEqual({
      ok: false,
      error: '预期校验和必须是十六进制字符',
    });
  });

  it('rejects a non-hexadecimal or incorrectly sized expected checksum', () => {
    expect(normalizeExpectedChecksum('g'.repeat(32), 'md5')).toEqual({
      ok: false,
      error: '预期校验和必须是十六进制字符',
    });
    expect(normalizeExpectedChecksum('a'.repeat(31), 'md5')).toEqual({
      ok: false,
      error: 'MD5 校验和应为 32 个十六进制字符',
    });
  });

  it('exports source, progress, and successful hashing contracts', () => {
    const source: HashSource = { kind: 'text', text: 'abc' };
    const progress: HashProgress = { completedBytes: 3, totalBytes: 3 };
    const success: HashSuccess = { algorithm: 'sha256', digest: 'a'.repeat(64) };

    expect(source).toEqual({ kind: 'text', text: 'abc' });
    expect(progress).toEqual({ completedBytes: 3, totalBytes: 3 });
    expect(success.algorithm).toBe('sha256');
  });
});
