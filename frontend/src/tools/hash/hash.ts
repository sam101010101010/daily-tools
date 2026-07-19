export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';

type HashAlgorithmDefinition = Readonly<{
  id: HashAlgorithm;
  label: string;
  digestLength: number;
  legacy: boolean;
}>;

export const HASH_ALGORITHMS: readonly HashAlgorithmDefinition[] = [
  { id: 'md5', label: 'MD5（兼容）', digestLength: 32, legacy: true },
  { id: 'sha1', label: 'SHA-1（兼容）', digestLength: 40, legacy: true },
  { id: 'sha256', label: 'SHA-256', digestLength: 64, legacy: false },
  { id: 'sha384', label: 'SHA-384', digestLength: 96, legacy: false },
  { id: 'sha512', label: 'SHA-512', digestLength: 128, legacy: false },
];

export const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'sha256';

export type HashSource =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'file'; file: File }>;

export type HashProgress = Readonly<{
  completedBytes: number;
  totalBytes: number;
}>;

export type HashSuccess = Readonly<{
  algorithm: HashAlgorithm;
  digest: string;
}>;

export type NormalizeExpectedChecksumResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; error: string }>;

export function normalizeExpectedChecksum(
  value: string,
  algorithm: HashAlgorithm,
): NormalizeExpectedChecksumResult {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized)) {
    return { ok: false, error: '预期校验和必须是十六进制字符' };
  }

  const definition = HASH_ALGORITHMS.find(({ id }) => id === algorithm)!;
  if (normalized.length !== definition.digestLength) {
    return {
      ok: false,
      error: `${definition.label.replace('（兼容）', '')} 校验和应为 ${definition.digestLength} 个十六进制字符`,
    };
  }

  return { ok: true, value: normalized };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(1)} ${units[exponent]}`;
}
