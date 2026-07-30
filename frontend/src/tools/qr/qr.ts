import { encodeQR } from 'qr';

export const QR_ECC_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export type QrEcc = (typeof QR_ECC_LEVELS)[number];

type QrRuntimeEcc = 'low' | 'medium' | 'quartile' | 'high';

const ECC_MAPPING: Readonly<Record<QrEcc, QrRuntimeEcc>> = Object.freeze({
  L: 'low',
  M: 'medium',
  Q: 'quartile',
  H: 'high',
});

const MAX_TEXT_BYTES = 4 * 1024;
const QUIET_ZONE = 4;

export type QrGenerationErrorCode =
  | 'QR_EMPTY_INPUT'
  | 'QR_INPUT_TOO_LARGE'
  | 'QR_CONTENT_TOO_LARGE';

export class QrGenerationError extends Error {
  readonly code: QrGenerationErrorCode;

  constructor(code: QrGenerationErrorCode, message: string) {
    super(message);
    this.name = 'QrGenerationError';
    this.code = code;
  }
}

export type GeneratedQr = Readonly<{
  ecc: QrEcc;
  quietZone: typeof QUIET_ZONE;
  matrix: readonly (readonly boolean[])[];
}>;

export type QrPngSource = Readonly<{
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}>;

export type QrDownload = Readonly<{
  filename: string;
  mimeType: 'image/svg+xml' | 'image/png';
  url: string;
  revoke: () => void;
}>;

function freezeMatrix(matrix: boolean[][]): readonly (readonly boolean[])[] {
  return Object.freeze(matrix.map((row) => Object.freeze([...row])));
}

function isCapacityError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Capacity overflow';
}

export function generateQr(text: string, ecc: QrEcc = 'M'): GeneratedQr {
  if (text.length === 0) {
    throw new QrGenerationError('QR_EMPTY_INPUT', '请输入要生成二维码的文本');
  }

  if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
    throw new QrGenerationError('QR_INPUT_TOO_LARGE', '二维码文本不能超过 4 KiB');
  }

  try {
    const matrix = encodeQR(text, 'raw', { ecc: ECC_MAPPING[ecc], border: QUIET_ZONE });
    return Object.freeze({ ecc, quietZone: QUIET_ZONE, matrix: freezeMatrix(matrix) });
  } catch (error) {
    if (isCapacityError(error)) {
      throw new QrGenerationError('QR_CONTENT_TOO_LARGE', '该文本无法容纳在所选纠错级别中');
    }
    throw error;
  }
}

export function createQrSvg(qr: GeneratedQr): string {
  const path = qr.matrix.flatMap((row, y) => row.flatMap((module, x) => (
    module ? [`M${x} ${y}h1v1H${x}z`] : []
  ))).join('');
  const size = qr.matrix.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path d="${path}"/></svg>`;
}

export function createQrPngSource(qr: GeneratedQr): QrPngSource {
  const width = qr.matrix[0]?.length ?? 0;
  const height = qr.matrix.length;
  const rgba = new Uint8ClampedArray(width * height * 4);

  qr.matrix.forEach((row, y) => {
    row.forEach((module, x) => {
      const offset = (y * width + x) * 4;
      const color = module ? 0 : 255;
      rgba[offset] = color;
      rgba[offset + 1] = color;
      rgba[offset + 2] = color;
      rgba[offset + 3] = 255;
    });
  });

  return Object.freeze({ width, height, rgba });
}

function createDownload(
  blob: Blob,
  filename: string,
  mimeType: QrDownload['mimeType'],
): QrDownload {
  const url = URL.createObjectURL(blob);
  let isActive = true;
  return Object.freeze({
    filename,
    mimeType,
    url,
    revoke: () => {
      if (!isActive) return;
      URL.revokeObjectURL(url);
      isActive = false;
    },
  });
}

export function createSvgDownload(qr: GeneratedQr): QrDownload {
  return createDownload(
    new Blob([createQrSvg(qr)], { type: 'image/svg+xml' }),
    'daily-tools-qr-code.svg',
    'image/svg+xml',
  );
}

export function createPngDownload(png: Blob): QrDownload {
  if (png.type !== 'image/png') {
    throw new TypeError('PNG 下载只能使用 image/png 数据');
  }
  return createDownload(png, 'daily-tools-qr-code.png', 'image/png');
}
