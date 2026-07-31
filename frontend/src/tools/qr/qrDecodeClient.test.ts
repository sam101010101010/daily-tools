import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import readablePngDataUrl from './fixtures/readable.png?inline';
import { calculateDecodeDimensions, startQrDecode } from './qrDecodeClient';

class FakeCanvas {
  width = 0;
  height = 0;
  readonly context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      width: this.width,
      height: this.height,
      data: new Uint8ClampedArray(this.width * this.height * 4).fill(255),
    })),
  };
  readonly getContext = vi.fn((kind: string) => kind === '2d' ? this.context : null);
}

class MockWorker {
  static instances: MockWorker[] = [];
  static constructorError: Error | undefined;
  static postMessageError: Error | undefined;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly receivedMessages: unknown[] = [];
  readonly postMessage = vi.fn((message: unknown, transfer: Transferable[] = []) => {
    if (MockWorker.postMessageError) throw MockWorker.postMessageError;
    this.receivedMessages.push(structuredClone(message, { transfer }));
  });
  readonly terminate = vi.fn();

  constructor(..._args: unknown[]) {
    if (MockWorker.constructorError) throw MockWorker.constructorError;
    MockWorker.instances.push(this);
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(): void {
    this.onerror?.({} as ErrorEvent);
  }
}

function handlers() {
  return {
    onSuccess: vi.fn(),
    onNotFound: vi.fn(),
    onError: vi.fn(),
  };
}

function readableFile(name = 'readable.png', type = 'image/png'): File {
  const [, base64] = readablePngDataUrl.split(',');
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new File([bytes], name, { type });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('QR decode pixel cap', () => {
  it.each([
    { source: [198, 198], target: { width: 198, height: 198 } },
    { source: [2048, 2048], target: { width: 2048, height: 2048 } },
    { source: [4096, 1024], target: { width: 4096, height: 1024 } },
  ] as const)(
    'does not upscale or alter a $source.0×$source.1 source at or below the cap',
    ({ source, target }) => {
      expect(calculateDecodeDimensions(source[0], source[1])).toEqual(target);
    },
  );

  it('reduces the 4096×4096 square worst case to 2048×2048', () => {
    expect(calculateDecodeDimensions(4096, 4096)).toEqual({
      width: 2048,
      height: 2048,
    });
  });

  it.each([
    { source: [4096, 2048], target: { width: 2896, height: 1448 } },
    { source: [2048, 4096], target: { width: 1448, height: 2896 } },
  ] as const)(
    'proportionally scales a $source.0×$source.1 source in either orientation',
    ({ source, target }) => {
      expect(calculateDecodeDimensions(source[0], source[1])).toEqual(target);
      expect(target.width * target.height).toBeLessThanOrEqual(4_194_304);
    },
  );

  it.each([
    { source: [4096, 4095], target: { width: 2048, height: 2047 } },
    { source: [4096, 1025], target: { width: 4094, height: 1024 } },
  ] as const)(
    'floors fractional target dimensions for $source.0×$source.1 without exceeding the cap',
    ({ source, target }) => {
      expect(calculateDecodeDimensions(source[0], source[1])).toEqual(target);
      expect(target.width * target.height).toBeLessThanOrEqual(4_194_304);
    },
  );
});

describe('QR decode client', () => {
  const cancellations: Array<() => void> = [];
  let canvases: FakeCanvas[];

  beforeEach(() => {
    cancellations.length = 0;
    canvases = [];
    MockWorker.instances = [];
    MockWorker.constructorError = undefined;
    MockWorker.postMessageError = undefined;
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    });
  });

  afterEach(() => {
    cancellations.forEach((cancel) => cancel());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects files above 10 MiB before reading or decoding them', () => {
    const callbacks = handlers();
    const slice = vi.fn();
    const file = {
      name: 'huge.png',
      type: 'image/png',
      size: 10 * 1024 * 1024 + 1,
      slice,
    } as unknown as File;

    startQrDecode(file, callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('图片文件不能超过 10 MiB');
    expect(slice).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('accepts browser-decodable PNG bytes despite mismatched MIME and extension metadata', async () => {
    const file = readableFile('mislabeled.txt', 'text/plain');
    const bitmap = { width: 198, height: 198, close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(createImageBitmap).mockResolvedValue(bitmap);

    cancellations.push(startQrDecode(file, handlers()));

    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0];
    const message = worker.postMessage.mock.calls[0]?.[0] as {
      type: string;
      width: number;
      height: number;
    };

    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(message).toMatchObject({ type: 'decode', width: 198, height: 198 });
    expect(canvases).toHaveLength(1);
  });

  it('reports a fixed local error when supported-looking image bytes cannot be decoded', async () => {
    const callbacks = handlers();
    const file = new File(
      [Uint8Array.of(0xff, 0xd8, 0xff, 0x00, 0x01)],
      'corrupt.jpg',
      { type: 'image/jpeg' },
    );
    vi.mocked(createImageBitmap).mockRejectedValue(
      new DOMException('private decoder details', 'InvalidStateError'),
    );

    cancellations.push(startQrDecode(file, callbacks));

    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());
    expect(callbacks.onError).toHaveBeenCalledWith(
      '图片无法读取，请选择有效的 PNG、JPEG 或 WebP 文件',
    );
    expect(callbacks.onError.mock.calls.flat().join(' ')).not.toContain('private decoder details');
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('maps unreadable file headers to the fixed local image error', async () => {
    const callbacks = handlers();
    const file = {
      name: 'unreadable.png',
      type: 'image/png',
      size: 8,
      slice: () => ({
        arrayBuffer: async () => Promise.reject(new Error('private file read failure')),
      }),
    } as unknown as File;

    cancellations.push(startQrDecode(file, callbacks));

    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());
    expect(callbacks.onError).toHaveBeenCalledWith(
      '图片无法读取，请选择有效的 PNG、JPEG 或 WebP 文件',
    );
    expect(callbacks.onError.mock.calls.flat().join(' ')).not.toContain('private');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('rejects browser-decodable formats outside PNG, JPEG, and WebP by content', async () => {
    const callbacks = handlers();
    const file = new File(
      [Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)],
      'pretends-to-be.png',
      { type: 'image/png' },
    );
    vi.mocked(createImageBitmap).mockResolvedValue(
      { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap,
    );

    cancellations.push(startQrDecode(file, callbacks));

    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());
    expect(callbacks.onError).toHaveBeenCalledWith('请选择 PNG、JPEG 或 WebP 图片');
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('rejects decoded dimensions above 4096 before allocating a canvas', async () => {
    const callbacks = handlers();
    const file = readableFile('wide.png');
    const bitmap = { width: 4097, height: 1, close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(createImageBitmap).mockResolvedValue(bitmap);

    cancellations.push(startQrDecode(file, callbacks));

    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());
    expect(callbacks.onError).toHaveBeenCalledWith('图片宽高不能超过 4096 像素');
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvases).toHaveLength(0);
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('downscales a 4096×4096 source before canvas allocation and pixel transfer', async () => {
    const file = readableFile('maximum.png');
    const bitmap = { width: 4096, height: 4096, close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(createImageBitmap).mockResolvedValue(bitmap);

    cancellations.push(startQrDecode(file, handlers()));

    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const canvas = canvases[0];
    const worker = MockWorker.instances[0];
    const message = worker.receivedMessages[0] as {
      width: number;
      height: number;
      pixels: ArrayBuffer;
    };

    expect(canvas).toMatchObject({ width: 0, height: 0 });
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(canvas.context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 2048);
    expect(canvas.context.getImageData).toHaveBeenCalledWith(0, 0, 2048, 2048);
    expect(message).toMatchObject({ width: 2048, height: 2048 });
    expect(message.pixels.byteLength).toBe(2048 * 2048 * 4);
  });

  it('structured-clones transferred pixels, detaches the sender, and preserves receiver bytes', async () => {
    const file = readableFile('pixels.png');
    const bitmap = { width: 198, height: 198, close: vi.fn() } as unknown as ImageBitmap;
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
    vi.mocked(createImageBitmap).mockResolvedValue(bitmap);

    cancellations.push(startQrDecode(file, handlers()));

    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const canvas = canvases[0];
    const imageData = canvas.context.getImageData.mock.results[0].value;
    const worker = MockWorker.instances[0];
    const postedMessage = worker.postMessage.mock.calls[0][0] as { pixels: ArrayBuffer };

    expect(postedMessage.pixels.byteLength).toBe(0);
    expect(imageData.data.byteLength).toBe(0);
    expect(worker.receivedMessages).toHaveLength(1);
    const receivedMessage = worker.receivedMessages[0] as { pixels: ArrayBuffer };
    expect(receivedMessage.pixels.byteLength).toBe(198 * 198 * 4);
    expect(Array.from(new Uint8ClampedArray(receivedMessage.pixels))).toEqual(
      Array(198 * 198 * 4).fill(255),
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas).toMatchObject({ width: 0, height: 0 });
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it('returns decoded worker text unchanged as untrusted plain text and terminates', async () => {
    const callbacks = handlers();
    const file = readableFile('plain-text.png');
    vi.mocked(createImageBitmap).mockResolvedValue(
      { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap,
    );

    cancellations.push(startQrDecode(file, callbacks));
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0];
    const jobId = (worker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;

    worker.emit({ type: 'success', jobId, text: '<img src=x onerror=alert(1)>' });

    expect(callbacks.onSuccess).toHaveBeenCalledWith('<img src=x onerror=alert(1)>');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancels the prior job on replacement and makes its late Worker result inert', async () => {
    const oldCallbacks = handlers();
    const newCallbacks = handlers();
    vi.mocked(createImageBitmap)
      .mockResolvedValueOnce(
        { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap,
      )
      .mockResolvedValueOnce(
        { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap,
      );

    cancellations.push(startQrDecode(readableFile('old.png'), oldCallbacks));
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const oldWorker = MockWorker.instances[0];
    const oldJobId = (oldWorker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;

    cancellations.push(startQrDecode(readableFile('new.png'), newCallbacks));
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(2));
    const newWorker = MockWorker.instances[1];
    const newJobId = (newWorker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;

    oldWorker.emit({ type: 'success', jobId: oldJobId, text: 'stale' });
    newWorker.emit({ type: 'success', jobId: newJobId, text: 'current' });

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(oldCallbacks.onSuccess).not.toHaveBeenCalled();
    expect(newCallbacks.onSuccess).toHaveBeenCalledWith('current');
  });

  it('makes cancellation safe while browser decoding is pending and closes a late bitmap', async () => {
    const callbacks = handlers();
    const file = readableFile('pending.png');
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    let resolveBitmap: ((value: ImageBitmap) => void) | undefined;
    vi.mocked(createImageBitmap).mockReturnValue(new Promise((resolve) => {
      resolveBitmap = resolve;
    }));

    const cancel = startQrDecode(file, callbacks);
    cancellations.push(cancel);
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());

    cancel();
    resolveBitmap?.(bitmap);

    await vi.waitFor(() => expect(bitmap.close).toHaveBeenCalledOnce());
    expect(canvases).toHaveLength(0);
    expect(MockWorker.instances).toHaveLength(0);
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('ignores a late browser-decode rejection after cancellation', async () => {
    const callbacks = handlers();
    const file = readableFile('cancelled-rejection.png');
    let rejectBitmap: ((reason: unknown) => void) | undefined;
    vi.mocked(createImageBitmap).mockReturnValue(new Promise((_resolve, reject) => {
      rejectBitmap = reject;
    }));

    const cancel = startQrDecode(file, callbacks);
    cancellations.push(cancel);
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());
    cancel();
    rejectBitmap?.(new DOMException('late decoder failure', 'InvalidStateError'));
    await flushMicrotasks();

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('does not begin browser decoding when cancellation wins a pending header read', async () => {
    const callbacks = handlers();
    const header = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    let resolveHeader: ((value: ArrayBuffer) => void) | undefined;
    const file = {
      name: 'pending-header.png',
      type: 'image/png',
      size: header.byteLength,
      slice: () => ({
        arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => {
          resolveHeader = resolve;
        }),
      }),
    } as unknown as File;

    const cancel = startQrDecode(file, callbacks);
    cancellations.push(cancel);
    cancel();
    resolveHeader?.(header.buffer);
    await flushMicrotasks();

    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(MockWorker.instances).toHaveLength(0);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('terminates a timed-out Worker, reports a fixed error, and ignores its late result', async () => {
    vi.useFakeTimers();
    try {
      const callbacks = handlers();
      const file = readableFile('timeout.png');
      vi.mocked(createImageBitmap).mockResolvedValue(
        { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap,
      );

      cancellations.push(startQrDecode(file, callbacks));
      await flushMicrotasks();
      const worker = MockWorker.instances[0];
      const jobId = (worker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;

      await vi.advanceTimersByTimeAsync(2_000);
      worker.emit({ type: 'success', jobId, text: 'too late' });

      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(callbacks.onError).toHaveBeenCalledWith('二维码解析超时，请尝试更小的图片');
      expect(callbacks.onSuccess).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps native Worker errors to a fixed local error and ignores later messages', async () => {
    const callbacks = handlers();
    const file = readableFile('worker-error.png');
    vi.mocked(createImageBitmap).mockResolvedValue(
      { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap,
    );

    cancellations.push(startQrDecode(file, callbacks));
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0];
    const jobId = (worker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;

    worker.emitError();
    worker.emit({ type: 'success', jobId, text: 'late after native error' });

    expect(callbacks.onError).toHaveBeenCalledWith('二维码解析失败，请重试。');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
  });

  it.each(['constructor', 'postMessage'] as const)(
    'maps Worker %s failures and still releases decoded image resources',
    async (failure) => {
      const callbacks = handlers();
      const file = readableFile(`${failure}.png`);
      const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
      vi.mocked(createImageBitmap).mockResolvedValue(bitmap);
      if (failure === 'constructor') {
        MockWorker.constructorError = new Error('worker unavailable');
      } else {
        MockWorker.postMessageError = new Error('pixel transfer failed');
      }

      cancellations.push(startQrDecode(file, callbacks));

      await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());
      expect(callbacks.onError).toHaveBeenCalledWith('二维码解析失败，请重试。');
      expect(bitmap.close).toHaveBeenCalledOnce();
      expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
      if (failure === 'postMessage') {
        expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce();
      }
    },
  );

  it('closes the decoded bitmap when canvas construction fails', async () => {
    const callbacks = handlers();
    const file = readableFile('canvas-construction.png');
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(createImageBitmap).mockResolvedValue(bitmap);
    vi.mocked(document.createElement).mockImplementationOnce(() => {
      throw new Error('canvas construction failed');
    });

    cancellations.push(startQrDecode(file, callbacks));

    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith('二维码解析失败，请重试。');
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('keeps Worker completion live when one canvas-release operation throws', async () => {
    const callbacks = handlers();
    const file = readableFile('canvas-release.png');
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const canvas = new FakeCanvas();
    let width = 0;
    let height = 0;
    let widthReleaseAttempts = 0;
    Object.defineProperty(canvas, 'width', {
      configurable: true,
      get: () => width,
      set: (value: number) => {
        if (value === 0 && width > 0) {
          widthReleaseAttempts += 1;
          throw new Error('width release failed');
        }
        width = value;
      },
    });
    Object.defineProperty(canvas, 'height', {
      configurable: true,
      get: () => height,
      set: (value: number) => {
        height = value;
      },
    });
    vi.mocked(document.createElement).mockReturnValueOnce(
      canvas as unknown as HTMLCanvasElement,
    );
    vi.mocked(createImageBitmap).mockResolvedValue(bitmap);

    cancellations.push(startQrDecode(file, callbacks));
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0];
    const received = worker.receivedMessages[0] as { jobId: string };

    worker.emit({ type: 'success', jobId: received.jobId, text: 'decoded' });

    expect(callbacks.onSuccess).toHaveBeenCalledWith('decoded');
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(widthReleaseAttempts).toBe(1);
    expect(height).toBe(0);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('forwards the typed not-found outcome and terminates the Worker', async () => {
    const callbacks = handlers();
    const file = readableFile('no-code.png');
    vi.mocked(createImageBitmap).mockResolvedValue(
      { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap,
    );

    cancellations.push(startQrDecode(file, callbacks));
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0];
    const jobId = (worker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;

    worker.emit({
      type: 'not-found',
      jobId,
      message: '未在图片中识别到二维码',
    });

    expect(callbacks.onNotFound).toHaveBeenCalledWith('未在图片中识别到二维码');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('sanitizes Worker error messages before reporting them locally', async () => {
    const callbacks = handlers();
    const file = readableFile('decode-error.png');
    vi.mocked(createImageBitmap).mockResolvedValue(
      { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap,
    );

    cancellations.push(startQrDecode(file, callbacks));
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0];
    const jobId = (worker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;

    worker.emit({
      type: 'error',
      jobId,
      message: 'private stack and bytes',
    });

    expect(callbacks.onError).toHaveBeenCalledWith('二维码解析失败，请重试。');
    expect(callbacks.onError.mock.calls.flat().join(' ')).not.toContain('private');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
