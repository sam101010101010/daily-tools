import decodeQr from 'qr/decode.js';

const MAX_IMAGE_DIMENSION = 4096;

export type QrDecodeWorkerStartMessage = Readonly<{
  type: 'decode';
  jobId: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
}>;

export type QrDecodeWorkerMessage =
  | Readonly<{
      type: 'success';
      jobId: string;
      text: string;
    }>
  | Readonly<{
      type: 'not-found';
      jobId: string;
      message: '未在图片中识别到二维码';
    }>
  | Readonly<{
      type: 'error';
      jobId: string;
      message: '二维码解析失败，请重试。';
    }>;

function isQrNotFound(error: unknown): boolean {
  return error instanceof Error
    && (error.message === 'image too small'
      || /^Finder: len\(found\) = [0-2]$/.test(error.message));
}

export function runQrDecodeWorkerJob(
  request: QrDecodeWorkerStartMessage,
  postMessage: (message: QrDecodeWorkerMessage) => void,
): void {
  const hasValidShape = Number.isSafeInteger(request.width)
    && request.width > 0
    && request.width <= MAX_IMAGE_DIMENSION
    && Number.isSafeInteger(request.height)
    && request.height > 0
    && request.height <= MAX_IMAGE_DIMENSION
    && request.pixels.byteLength === request.width * request.height * 4;
  if (!hasValidShape) {
    postMessage({
      type: 'error',
      jobId: request.jobId,
      message: '二维码解析失败，请重试。',
    });
    return;
  }

  try {
    const text = decodeQr({
      width: request.width,
      height: request.height,
      data: new Uint8ClampedArray(request.pixels),
    });
    postMessage({ type: 'success', jobId: request.jobId, text });
  } catch (error) {
    if (isQrNotFound(error)) {
      postMessage({
        type: 'not-found',
        jobId: request.jobId,
        message: '未在图片中识别到二维码',
      });
      return;
    }
    postMessage({
      type: 'error',
      jobId: request.jobId,
      message: '二维码解析失败，请重试。',
    });
  }
}

if (
  typeof document === 'undefined' &&
  typeof globalThis.addEventListener === 'function' &&
  typeof globalThis.postMessage === 'function'
) {
  globalThis.addEventListener('message', (event: MessageEvent<QrDecodeWorkerStartMessage>) => {
    if (event.data.type === 'decode') {
      runQrDecodeWorkerJob(event.data, (message) => globalThis.postMessage(message));
    }
  });
}
