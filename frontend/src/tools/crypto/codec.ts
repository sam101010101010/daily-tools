// Encoding family for the crypto tool — pure frontend, no key, no network (ADR-0007).
// base64 is moved verbatim from tools/base64; hex is new.

export function encodeBase64(input: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  const b64 = btoa(bin);
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
}

export function decodeBase64(input: string): { ok: boolean; output?: string; error?: string } {
  try {
    let s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    while (s.length % 4) s += '=';
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('bad');
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return { ok: true, output: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: '不是合法的 Base64 输入' };
  }
}

// --- hex ---

export function encodeHex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let hex = '';
  bytes.forEach(b => { hex += b.toString(16).padStart(2, '0'); });
  return hex;
}

export function decodeHex(input: string): { ok: boolean; output?: string; error?: string } {
  try {
    const s = input.replace(/\s/g, '');
    if (s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) throw new Error('bad');
    const bytes = new Uint8Array(s.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    }
    return { ok: true, output: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: '不是合法的 Hex 输入' };
  }
}
