import type { QrDecodeWorkerMessage } from './qr.worker';

export type QrDecodeHandlers = Readonly<{
  onSuccess: (text: string) => void;
  onNotFound: (message: string) => void;
  onError: (message: string) => void;
}>;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
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

function closeBitmap(bitmap: ImageBitmap): void {
  try {
    bitmap.close();
  } catch {
    // Cleanup failures must not expose native details or prevent other cleanup.
  }
}

function terminateWorker(worker: Worker): void {
  try {
    worker.terminate();
  } catch {
    // Cleanup failures must not expose native details or prevent other cleanup.
  }
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export function startQrDecode(file: File, handlers: QrDecodeHandlers): () => void {
  cancelActiveJob?.();

  if (file.size > MAX_FILE_BYTES) {
    handlers.onError('图片文件不能超过 10 MiB');
    return () => undefined;
  }

  let worker: Worker | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let isActive = true;
  const jobId = `qr-decode-${++nextJobId}`;
  const cancel = () => {
    if (!isActive) return;
    isActive = false;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (worker) terminateWorker(worker);
    if (cancelActiveJob === cancel) cancelActiveJob = undefined;
  };
  cancelActiveJob = cancel;

  void (async () => {
    let bitmap: ImageBitmap;
    try {
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!isActive) return;
      if (!hasSupportedSignature(header)) {
        if (!isActive) return;
        isActive = false;
        if (cancelActiveJob === cancel) cancelActiveJob = undefined;
        handlers.onError('请选择 PNG、JPEG 或 WebP 图片');
        return;
      }
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        if (!isActive) return;
        isActive = false;
        if (cancelActiveJob === cancel) cancelActiveJob = undefined;
        handlers.onError('图片无法读取，请选择有效的 PNG、JPEG 或 WebP 文件');
        return;
      }
      if (!isActive) {
        closeBitmap(bitmap);
        return;
      }
      if (bitmap.width > MAX_IMAGE_DIMENSION || bitmap.height > MAX_IMAGE_DIMENSION) {
        closeBitmap(bitmap);
        isActive = false;
        if (cancelActiveJob === cancel) cancelActiveJob = undefined;
        handlers.onError('图片宽高不能超过 4096 像素');
        return;
      }
      const canvas = document.createElement('canvas');
      try {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context unavailable');
        context.drawImage(bitmap, 0, 0);
        const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);

        worker = new Worker(new URL('./qr.worker.ts', import.meta.url), { type: 'module' });
        timeoutId = setTimeout(() => {
          if (!isActive) return;
          isActive = false;
          if (worker) terminateWorker(worker);
          if (cancelActiveJob === cancel) cancelActiveJob = undefined;
          handlers.onError('二维码解析超时，请尝试更小的图片');
        }, QR_DECODE_TIMEOUT_MS);
        worker.onmessage = (event: MessageEvent<QrDecodeWorkerMessage>) => {
          const message = event.data;
          if (!isActive || message.jobId !== jobId) return;
          isActive = false;
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          if (worker) terminateWorker(worker);
          if (cancelActiveJob === cancel) cancelActiveJob = undefined;
          if (message.type === 'success') {
            handlers.onSuccess(message.text);
          } else if (message.type === 'not-found') {
            handlers.onNotFound(message.message);
          } else {
            handlers.onError('二维码解析失败，请重试。');
          }
        };
        worker.onerror = () => {
          if (!isActive) return;
          isActive = false;
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          if (worker) terminateWorker(worker);
          if (cancelActiveJob === cancel) cancelActiveJob = undefined;
          handlers.onError('二维码解析失败，请重试。');
        };
        const startMessage = {
          type: 'decode',
          jobId,
          width: bitmap.width,
          height: bitmap.height,
          pixels: imageData.data.buffer,
        } as const;
        worker.postMessage(startMessage, [imageData.data.buffer]);
      } catch {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (worker) terminateWorker(worker);
        if (isActive) {
          isActive = false;
          if (cancelActiveJob === cancel) cancelActiveJob = undefined;
          handlers.onError('二维码解析失败，请重试。');
        }
      } finally {
        closeBitmap(bitmap);
        releaseCanvas(canvas);
      }
    } catch {
      if (!isActive) return;
      isActive = false;
      if (cancelActiveJob === cancel) cancelActiveJob = undefined;
      handlers.onError('图片无法读取，请选择有效的 PNG、JPEG 或 WebP 文件');
    }
  })();

  return cancel;
}
