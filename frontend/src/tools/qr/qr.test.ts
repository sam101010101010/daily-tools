import { describe, expect, it, vi } from 'vitest';
import {
  QrGenerationError,
  createPngDownload,
  createQrPngSource,
  createQrSvg,
  createSvgDownload,
  generateQr,
} from './qr';

function expectGenerationError(action: () => unknown, code: QrGenerationError['code']): void {
  try {
    action();
    throw new Error('Expected QR generation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(QrGenerationError);
    expect(error).toMatchObject({ code });
  }
}

describe('generateQr', () => {
  it('keeps the public ASCII HELLO WORLD vector in a deterministic matrix with a four-module quiet zone', () => {
    const qr = generateQr('HELLO WORLD');

    expect(qr.ecc).toBe('M');
    expect(qr.quietZone).toBe(4);
    expect(qr.matrix).toHaveLength(29);
    expect(qr.matrix.every((row) => row.length === 29)).toBe(true);
    expect(qr.matrix.slice(0, 4).every((row) => row.every((module) => !module))).toBe(true);
    expect(qr.matrix[4]?.slice(4, 11)).toEqual([true, true, true, true, true, true, true]);
    expect(qr.matrix[11]?.slice(4, 11)).toEqual([false, false, false, false, false, false, false]);
  });

  it('encodes the public Unicode vector 你好，世界 as UTF-8', () => {
    const qr = generateQr('你好，世界', 'M');

    expect(qr.matrix).toHaveLength(33);
    expect(qr.matrix.every((row) => row.length === 33)).toBe(true);
  });

  it('maps the four selectable ECC levels without silently changing the requested level', () => {
    const shortText = 'A'.repeat(20);
    const longerText = 'A'.repeat(25);

    expect(generateQr(shortText, 'L')).toMatchObject({ ecc: 'L', matrix: expect.any(Array) });
    expect(generateQr(shortText, 'M')).toMatchObject({ ecc: 'M', matrix: expect.any(Array) });
    expect(generateQr(shortText, 'Q')).toMatchObject({ ecc: 'Q', matrix: expect.any(Array) });
    expect(generateQr(shortText, 'H')).toMatchObject({ ecc: 'H', matrix: expect.any(Array) });
    expect(generateQr(shortText, 'L').matrix).toHaveLength(29);
    expect(generateQr(shortText, 'M').matrix).toHaveLength(29);
    expect(generateQr(shortText, 'Q').matrix).toHaveLength(33);
    expect(generateQr(shortText, 'H').matrix).toHaveLength(33);
    expect(generateQr(longerText, 'L').matrix).toHaveLength(29);
    expect(generateQr(longerText, 'M').matrix).toHaveLength(33);
    expect(generateQr(longerText, 'Q').matrix).toHaveLength(33);
    expect(generateQr(longerText, 'H').matrix).toHaveLength(37);
  });

  it('returns an immutable generated matrix', () => {
    const qr = generateQr('immutable');

    expect(Object.isFrozen(qr)).toBe(true);
    expect(Object.isFrozen(qr.matrix)).toBe(true);
    expect(Object.isFrozen(qr.matrix[0])).toBe(true);
  });

  it('rejects empty input with a typed error', () => {
    expectGenerationError(() => generateQr(''), 'QR_EMPTY_INPUT');
  });

  it('rejects UTF-8 text beyond 4 KiB before attempting QR encoding', () => {
    expectGenerationError(() => generateQr('你'.repeat(1366)), 'QR_INPUT_TOO_LARGE');
  });

  it('returns a separate typed capacity error at the selected ECC level', () => {
    expectGenerationError(() => generateQr('a'.repeat(3000), 'H'), 'QR_CONTENT_TOO_LARGE');
  });
});

describe('QR source and download helpers', () => {
  it('constructs SVG from trusted matrix primitives without user text', () => {
    const qr = generateQr('</path><script>alert(1)</script>');
    const svg = createQrSvg(qr);

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0');
    expect(svg).toContain('<path d="');
    expect(svg).not.toContain('</path><script>');
    expect(svg).not.toContain('alert(1)');
  });

  it('creates a canvas-ready PNG source from matrix modules alone', () => {
    const source = createQrPngSource(generateQr('A'));

    expect(source.width).toBe(29);
    expect(source.height).toBe(29);
    expect(source.rgba).toHaveLength(29 * 29 * 4);
    expect(Object.isFrozen(source)).toBe(true);
  });

  it('creates fixed-name SVG object URLs and revokes them on request', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:svg');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');

    const download = createSvgDownload(generateQr('private text'));

    expect(download).toMatchObject({
      filename: 'daily-tools-qr-code.svg',
      mimeType: 'image/svg+xml',
      url: 'blob:svg',
    });
    expect(download.filename).not.toContain('private text');
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/svg+xml' }));
    download.revoke();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:svg');
  });

  it('creates fixed-name PNG object URLs with the correct MIME type', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:png');
    const png = new Blob(['png bytes'], { type: 'image/png' });

    const download = createPngDownload(png);

    expect(download).toMatchObject({
      filename: 'daily-tools-qr-code.png',
      mimeType: 'image/png',
      url: 'blob:png',
    });
    expect(createObjectURL).toHaveBeenCalledWith(png);
  });
});
