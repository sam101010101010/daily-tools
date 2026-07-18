type JsonObject = Record<string, unknown>;

export type DecodedJwt = Readonly<{
  header: JsonObject;
  payload: JsonObject;
  signature: string;
}>;

export type DecodeJwtResult =
  | Readonly<{ ok: true; value: DecodedJwt }>
  | Readonly<{ ok: false; error: string }>;

type DecodeObjectResult =
  | { ok: true; value: JsonObject }
  | { ok: false; error: string };

// Keep parsed JSON within a browser-safe bound before recursive consumers such as
// JSON.stringify render it. The root object is depth 0.
const MAX_JSON_DEPTH = 100;

function base64urlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64url(segment: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) return undefined;

  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return base64urlFromBytes(bytes) === segment ? bytes : undefined;
  } catch {
    return undefined;
  }
}

type JsonSafetyIssue = 'too-deep' | 'non-finite-number' | 'unsafe';

function inspectAndFreezeJson(value: object): JsonSafetyIssue | undefined {
  const pending: Array<{ value: object; depth: number }> = [{ value, depth: 0 }];

  try {
    while (pending.length > 0) {
      const { value: current, depth } = pending.pop()!;
      Object.freeze(current);

      for (const child of Object.values(current)) {
        if (typeof child === 'number' && !Number.isFinite(child)) return 'non-finite-number';
        if (child !== null && typeof child === 'object') {
          if (depth >= MAX_JSON_DEPTH) return 'too-deep';
          pending.push({ value: child, depth: depth + 1 });
        }
      }
    }
  } catch {
    return 'unsafe';
  }

  return undefined;
}

function decodeJsonObject(segment: string, label: 'Header' | 'Payload'): DecodeObjectResult {
  const bytes = decodeBase64url(segment);
  if (!bytes) return { ok: false, error: `JWT ${label} 不是合法的 Base64URL` };

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: `JWT ${label} 不是有效的 UTF-8` };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: `JWT ${label} 不是合法的 JSON` };
  }

  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return { ok: false, error: `JWT ${label} 必须是 JSON 对象` };
  }

  const safetyIssue = inspectAndFreezeJson(value);
  if (safetyIssue === 'too-deep') {
    return { ok: false, error: `JWT ${label} 嵌套层级超过 ${MAX_JSON_DEPTH}，无法安全显示` };
  }
  if (safetyIssue === 'non-finite-number') {
    return { ok: false, error: `JWT ${label} 的 JSON 包含无法安全解析的非有限数字` };
  }
  if (safetyIssue === 'unsafe') {
    return { ok: false, error: `JWT ${label} 无法安全处理` };
  }

  return { ok: true, value: value as JsonObject };
}

export function decodeJwt(input: string): DecodeJwtResult {
  const segments = input.trim().split('.');
  const [headerSegment, payloadSegment, signature] = segments;

  if (segments.length !== 3 || !headerSegment || !payloadSegment) {
    return Object.freeze({ ok: false as const, error: 'JWT 必须是三段紧凑 JWS 格式' });
  }

  const header = decodeJsonObject(headerSegment, 'Header');
  if (!header.ok) return Object.freeze(header);

  const payload = decodeJsonObject(payloadSegment, 'Payload');
  if (!payload.ok) return Object.freeze(payload);

  if (!decodeBase64url(signature)) {
    return Object.freeze({ ok: false as const, error: 'JWT 签名不是合法的 Base64URL' });
  }

  return Object.freeze({
    ok: true as const,
    value: Object.freeze({ header: header.value, payload: payload.value, signature }),
  });
}

export function formatNumericDate(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;

  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}
