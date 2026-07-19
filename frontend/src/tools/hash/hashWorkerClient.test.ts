import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHashJob } from './hashWorkerClient';

class MockWorker {
  static instances: MockWorker[] = [];
  static postMessageError: Error | undefined;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((_message: unknown) => {
    if (MockWorker.postMessageError) throw MockWorker.postMessageError;
  });
  terminate = vi.fn();

  constructor(..._args: unknown[]) {
    MockWorker.instances.push(this);
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(): void {
    this.onerror?.({} as ErrorEvent);
  }
}

describe('hash worker client', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    MockWorker.postMessageError = undefined;
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards matching progress and success messages to the active job handlers', () => {
    const onProgress = vi.fn();
    const onSuccess = vi.fn();

    startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'abc' } },
      { onProgress, onSuccess, onError: vi.fn() },
    );
    const worker = MockWorker.instances[0];
    const [{ jobId }] = worker.postMessage.mock.calls.map(([message]) => message) as [{ jobId: string }];

    worker.emit({ type: 'progress', jobId, completedBytes: 2, totalBytes: 3 });
    worker.emit({ type: 'done', jobId, digest: 'a'.repeat(64) });

    expect(onProgress).toHaveBeenCalledWith({ completedBytes: 2, totalBytes: 3 });
    expect(onSuccess).toHaveBeenCalledWith({ algorithm: 'sha256', digest: 'a'.repeat(64) });
  });

  it('terminates the previous worker and ignores its late messages when a new job starts', () => {
    const oldHandlers = { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
    startHashJob({ algorithm: 'sha256', source: { kind: 'text', text: 'old' } }, oldHandlers);
    const oldWorker = MockWorker.instances[0];
    const [{ jobId: oldJobId }] = oldWorker.postMessage.mock.calls.map(([message]) => message) as [
      { jobId: string },
    ];

    const newHandlers = { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
    startHashJob({ algorithm: 'sha512', source: { kind: 'text', text: 'new' } }, newHandlers);
    const newWorker = MockWorker.instances[1];
    const [{ jobId: newJobId }] = newWorker.postMessage.mock.calls.map(([message]) => message) as [
      { jobId: string },
    ];

    oldWorker.emit({ type: 'done', jobId: oldJobId, digest: 'stale' });
    newWorker.emit({ type: 'progress', jobId: newJobId, completedBytes: 3, totalBytes: 3 });

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(oldHandlers.onSuccess).not.toHaveBeenCalled();
    expect(newHandlers.onProgress).toHaveBeenCalledWith({ completedBytes: 3, totalBytes: 3 });
  });

  it('terminates on cancellation and ignores messages that arrive afterwards', () => {
    const onSuccess = vi.fn();
    const cancel = startHashJob(
      { algorithm: 'md5', source: { kind: 'text', text: 'abc' } },
      { onProgress: vi.fn(), onSuccess, onError: vi.fn() },
    );
    const worker = MockWorker.instances[0];
    const [{ jobId }] = worker.postMessage.mock.calls.map(([message]) => message) as [{ jobId: string }];

    cancel();
    worker.emit({ type: 'done', jobId, digest: '900150983cd24fb0d6963f7d28e17f72' });

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does not let an old cancellation handle terminate a replacement worker', () => {
    const cancelOldJob = startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'old' } },
      { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    );
    const oldWorker = MockWorker.instances[0];

    startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'new' } },
      { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    );
    const newWorker = MockWorker.instances[1];

    cancelOldJob();

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(newWorker.terminate).not.toHaveBeenCalled();
  });

  it('reports a worker constructor failure without throwing and permits a later job', () => {
    const onError = vi.fn();
    class FailingWorker {
      constructor() {
        throw new Error('worker unavailable');
      }
    }
    vi.stubGlobal('Worker', FailingWorker);

    expect(() => startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'abc' } },
      { onProgress: vi.fn(), onSuccess: vi.fn(), onError },
    )).not.toThrow();
    expect(onError).toHaveBeenCalledWith('本地哈希计算失败，请重试。');

    vi.stubGlobal('Worker', MockWorker);
    startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'recovered' } },
      { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    );
    expect(MockWorker.instances).toHaveLength(1);
  });

  it('terminates and clears the worker when the start message throws', () => {
    const onError = vi.fn();
    MockWorker.postMessageError = new Error('cannot clone source');

    expect(() => startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'abc' } },
      { onProgress: vi.fn(), onSuccess: vi.fn(), onError },
    )).not.toThrow();
    const failedWorker = MockWorker.instances[0];
    expect(failedWorker.terminate).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('本地哈希计算失败，请重试。');

    MockWorker.postMessageError = undefined;
    startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'recovered' } },
      { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    );
    expect(failedWorker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates the worker after a final success message', () => {
    startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'abc' } },
      { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    );
    const worker = MockWorker.instances[0];
    const [{ jobId }] = worker.postMessage.mock.calls.map(([message]) => message) as [{ jobId: string }];

    worker.emit({ type: 'done', jobId, digest: 'a'.repeat(64) });

    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates after a native worker error and ignores later matching messages', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'abc' } },
      { onProgress: vi.fn(), onSuccess, onError },
    );
    const worker = MockWorker.instances[0];
    const [{ jobId }] = worker.postMessage.mock.calls.map(([message]) => message) as [{ jobId: string }];

    worker.emitError();
    worker.emit({ type: 'done', jobId, digest: 'a'.repeat(64) });

    expect(onError).toHaveBeenCalledWith('本地哈希计算失败，请重试。');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
