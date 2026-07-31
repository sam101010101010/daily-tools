import type { QrDecodeWorkerMessage } from './qr.worker';

export type QrDecodeHandlers = Readonly<{
  onSuccess: (text: string) => void;
  onNotFound: (message: string) => void;
  onError: (message: string) => void;
}>;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_DECODE_PIXELS = 4_194_304;
const QR_DECODE_TIMEOUT_MS = 1_500;
let nextJobId = 0;
let cancelActiveJob: (() => void) | undefined;

function hasSupportedSignature(bytes: Uint8Array): boolean {
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
  const isWebp = bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
  return isPng || isJpeg || isWebp;
}

export function calculateDecodeDimensions(
  width: number,
  height: number,
): Readonly<{ width: number; height: number }> {
  if (width * height <= MAX_DECODE_PIXELS) return { width, height };

  const scale = Math.sqrt(MAX_DECODE_PIXELS / (width * height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

type JobResources = {
  bitmap?: ImageBitmap;
  canvas?: HTMLCanvasElement;
  worker?: Worker;
  timeoutId?: ReturnType<typeof setTimeout>;
};

function cleanupJob(resources: JobResources, scope: 'image' | 'all' = 'all'): void {
  const bitmap = resources.bitmap;
  resources.bitmap = undefined;
  if (bitmap) {
    try {
      bitmap.close();
    } catch {
      // Continue reclaiming the remaining resources.
    }
  }

  const canvas = resources.canvas;
  resources.canvas = undefined;
  if (canvas) {
    try {
      canvas.width = 0;
    } catch {
      // Height still needs its independent cleanup attempt.
    }
    try {
      canvas.height = 0;
    } catch {
      // Canvas memory will otherwise be reclaimed by the browser.
    }
  }

  if (scope === 'image') return;

  const timeoutId = resources.timeoutId;
  resources.timeoutId = undefined;
  if (timeoutId !== undefined) {
    try {
      clearTimeout(timeoutId);
    } catch {
      // Continue to Worker cleanup.
    }
  }

  const worker = resources.worker;
  resources.worker = undefined;
  if (worker) {
    try {
      worker.terminate();
    } catch {
      // Native cleanup details are never exposed to the caller.
    }
  }
}

export function startQrDecode(file: File, handlers: QrDecodeHandlers): () => void {
  cancelActiveJob?.();

  if (file.size > MAX_FILE_BYTES) {
    handlers.onError('图片文件不能超过 10 MiB');
    return () => undefined;
  }

  const resources: JobResources = {};
  let isActive = true;
  const jobId = `qr-decode-${++nextJobId}`;
  const finish = (deliver?: () => void) => {
    if (!isActive) return;
    isActive = false;
    cleanupJob(resources);
    if (cancelActiveJob === cancel) cancelActiveJob = undefined;
    deliver?.();
  };
  const cancel = () => finish();
  cancelActiveJob = cancel;

  void (async () => {
    let header: Uint8Array;
    try {
      header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    } catch {
      finish(() => handlers.onError('图片无法读取，请选择有效的 PNG、JPEG 或 WebP 文件'));
      return;
    }
    if (!isActive) return;
    if (!hasSupportedSignature(header)) {
      finish(() => handlers.onError('请选择 PNG、JPEG 或 WebP 图片'));
      return;
    }

    try {
      resources.bitmap = await createImageBitmap(file);
    } catch {
      finish(() => handlers.onError('图片无法读取，请选择有效的 PNG、JPEG 或 WebP 文件'));
      return;
    }
    if (!isActive) {
      cleanupJob(resources, 'image');
      return;
    }

    const bitmap = resources.bitmap;
    if (bitmap.width > MAX_IMAGE_DIMENSION || bitmap.height > MAX_IMAGE_DIMENSION) {
      finish(() => handlers.onError('图片宽高不能超过 4096 像素'));
      return;
    }
    const target = calculateDecodeDimensions(bitmap.width, bitmap.height);

    try {
      resources.canvas = document.createElement('canvas');
      resources.canvas.width = target.width;
      resources.canvas.height = target.height;
      const context = resources.canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D context unavailable');
      context.drawImage(bitmap, 0, 0, target.width, target.height);
      const imageData = context.getImageData(0, 0, target.width, target.height);

      resources.worker = new Worker(new URL('./qr.worker.ts', import.meta.url), {
        type: 'module',
      });
      resources.timeoutId = setTimeout(() => {
        finish(() => handlers.onError('二维码解析超时，请尝试更小的图片'));
      }, QR_DECODE_TIMEOUT_MS);
      resources.worker.onmessage = (event: MessageEvent<QrDecodeWorkerMessage>) => {
        const message = event.data;
        if (!isActive || message.jobId !== jobId) return;
        finish(() => {
          if (message.type === 'success') {
            handlers.onSuccess(message.text);
          } else if (message.type === 'not-found') {
            handlers.onNotFound(message.message);
          } else {
            handlers.onError('二维码解析失败，请重试。');
          }
        });
      };
      resources.worker.onerror = () => {
        finish(() => handlers.onError('二维码解析失败，请重试。'));
      };
      const startMessage = {
        type: 'decode',
        jobId,
        width: target.width,
        height: target.height,
        pixels: imageData.data.buffer,
      } as const;
      resources.worker.postMessage(startMessage, [imageData.data.buffer]);
    } catch {
      finish(() => handlers.onError('二维码解析失败，请重试。'));
    } finally {
      cleanupJob(resources, 'image');
    }
  })();

  return cancel;
}
