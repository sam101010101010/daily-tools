import { describe, expect, it, vi } from 'vitest';
import {
  QrGenerationError,
  createPngDownload,
  createQrPngSource,
  createQrSvg,
  createSvgDownload,
  generateQr,
} from './qr';

/*
 * Complete ISO/IEC 18004 reference symbols, independently derived with
 * Kazuhiko Arase's QR Code generator (MIT, https://github.com/kazuhikoarase/qrcode-generator).
 * HELLO WORLD uses its documented alphanumeric encoding (V1-M, mask 0); 你好，世界
 * uses the UTF-8 byte sequence (V2-M, mask 1). The four light rows and columns
 * around each symbol are the QR quiet zone required by ISO/IEC 18004 §5.3.8.
 * These serialised fixtures are deliberately not calculated by the adapter or `qr`.
 */
const HELLO_WORLD_MATRIX = [
  '00000000000000000000000000000',
  '00000000000000000000000000000',
  '00000000000000000000000000000',
  '00000000000000000000000000000',
  '00001111111000101011111110000',
  '00001000001011100010000010000',
  '00001011101000101010111010000',
  '00001011101000101010111010000',
  '00001011101010111010111010000',
  '00001000001001110010000010000',
  '00001111111010101011111110000',
  '00000000000000000000000000000',
  '00001010101001001000100100000',
  '00000111100010010000100010000',
  '00000001111111010010110000000',
  '00001111010110011101011100000',
  '00000100111101010011101010000',
  '00000000000010100010001010000',
  '00001111111000001001011000000',
  '00001000001001100011010000000',
  '00001011101011001011111110000',
  '00001011101000110101000100000',
  '00001011101011110111010010000',
  '00001000001000011100010110000',
  '00001111111011010111000010000',
  '00000000000000000000000000000',
  '00000000000000000000000000000',
  '00000000000000000000000000000',
  '00000000000000000000000000000',
] as const;

const UNICODE_MATRIX = [
  '000000000000000000000000000000000',
  '000000000000000000000000000000000',
  '000000000000000000000000000000000',
  '000000000000000000000000000000000',
  '000011111110100100011011111110000',
  '000010000010000011101010000010000',
  '000010111010110100111010111010000',
  '000010111010010010100010111010000',
  '000010111010001011110010111010000',
  '000010000010101100010010000010000',
  '000011111110101010101011111110000',
  '000000000000000010111000000000000',
  '000010100011010101101001001010000',
  '000010001101101101100011100010000',
  '000001111010111110011011111100000',
  '000000000000100101001001111100000',
  '000010001010011111001101110000000',
  '000000011101101010000110110110000',
  '000011111110110011100101101100000',
  '000000000100111110101001101000000',
  '000011010011011001111111110010000',
  '000000000000101001111000110010000',
  '000011111110110100011010101000000',
  '000010000010001001001000101110000',
  '000010111010001111001111100000000',
  '000010111010000010011011111000000',
  '000010111010110011101011001110000',
  '000010000010010110101101111000000',
  '000011111110110001100100010010000',
  '000000000000000000000000000000000',
  '000000000000000000000000000000000',
  '000000000000000000000000000000000',
  '000000000000000000000000000000000',
] as const;

function serializeMatrix(matrix: readonly (readonly boolean[])[]): string[] {
  return matrix.map((row) => row.map((module) => module ? '1' : '0').join(''));
}

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
  it('matches every module of the public ASCII HELLO WORLD QR vector and its quiet zone', () => {
    const qr = generateQr('HELLO WORLD');

    expect(qr.ecc).toBe('M');
    expect(qr.quietZone).toBe(4);
    expect(serializeMatrix(qr.matrix)).toEqual(HELLO_WORLD_MATRIX);
  });

  it('matches every module of the public Unicode 你好，世界 UTF-8 QR vector and its quiet zone', () => {
    const qr = generateQr('你好，世界', 'M');

    expect(serializeMatrix(qr.matrix)).toEqual(UNICODE_MATRIX);
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
