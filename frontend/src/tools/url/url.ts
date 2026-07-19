export type DecodeUrlComponentResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; error: string }>;

export function encodeUrlComponent(input: string): string {
  return encodeURIComponent(input);
}

export function decodeUrlComponent(input: string): DecodeUrlComponentResult {
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch {
    return { ok: false, error: 'URL 编码格式无效，无法解码' };
  }
}
