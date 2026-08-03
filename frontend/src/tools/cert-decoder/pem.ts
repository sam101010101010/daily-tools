export const MAX_DER_BYTES = 1_048_576;

const ALLOWED_LABELS = [
  'CERTIFICATE',
  'CERTIFICATE REQUEST',
  'NEW CERTIFICATE REQUEST',
] as const;

export type PemLabel = typeof ALLOWED_LABELS[number];

export type PemParseResult =
  | Readonly<{ ok: true; value: Readonly<{ label: PemLabel; der: Uint8Array }> }>
  | Readonly<{ ok: false; error: Readonly<{ code: 'INVALID_PEM'; message: string }> }>;

function invalidPem(message: string): PemParseResult {
  return { ok: false, error: { code: 'INVALID_PEM', message } };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeCanonicalBase64(value: string): Uint8Array | undefined {
  if (
    value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) return undefined;

  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return bytesToBase64(bytes) === value ? bytes : undefined;
  } catch {
    return undefined;
  }
}

export function parseSinglePem(input: string): PemParseResult {
  const value = input.trim();
  const match = /^-----BEGIN ([A-Z ]+)-----\r?\n([\s\S]*?)\r?\n-----END ([A-Z ]+)-----$/.exec(value);
  if (!match) return invalidPem('提供的内容必须是一个完整的 PEM 块。');

  const [, beginLabel, wrappedBase64, endLabel] = match;
  if (beginLabel !== endLabel) return invalidPem('PEM 的开始和结束标签必须匹配。');
  if (!ALLOWED_LABELS.includes(beginLabel as PemLabel)) return invalidPem('不支持该 PEM 标签。');

  const der = decodeCanonicalBase64(wrappedBase64.replace(/\s/g, ''));
  if (!der) return invalidPem('PEM 内容不是规范的 Base64 编码。');
  if (der.byteLength > MAX_DER_BYTES) return invalidPem('PEM 解码后的内容超过 1 MiB 限制。');

  return { ok: true, value: { label: beginLabel as PemLabel, der } };
}
