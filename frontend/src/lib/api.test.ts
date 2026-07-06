import { afterEach, expect, test, vi } from 'vitest';
import { callTool } from './api';

afterEach(() => vi.restoreAllMocks());

test('returns the envelope when backend responds with one', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true, data: { x: 1 } }), { status: 200 }),
  );
  expect(await callTool('/api/java/x', {})).toEqual({ ok: true, data: { x: 1 } });
});

test('normalizes a network error to a NETWORK_ERROR envelope', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
  const res = await callTool('/api/java/x', {});
  expect(res).toEqual({ ok: false, error: { code: 'NETWORK_ERROR', message: 'boom' } });
});

test('normalizes a non-envelope response to BAD_RESPONSE', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>500</html>', { status: 500 }));
  const res = await callTool('/api/java/x', {});
  expect(res).toEqual({ ok: false, error: { code: 'BAD_RESPONSE', message: 'Unexpected response (500)' } });
});
