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
