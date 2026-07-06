import type { ApiEnvelope } from './envelope';

export async function callTool<T>(backend: string, body: unknown): Promise<ApiEnvelope<T>> {
  try {
    const res = await fetch(backend, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (json && typeof json.ok === 'boolean') return json as ApiEnvelope<T>;
    return { ok: false, error: { code: 'BAD_RESPONSE', message: `Unexpected response (${res.status})` } };
  } catch (e) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: (e as Error).message } };
  }
}
